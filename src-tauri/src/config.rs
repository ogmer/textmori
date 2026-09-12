use serde::{Deserialize, Serialize};
use std::io::Write;
use tauri::{AppHandle, Manager, Runtime};

/// Ghostty に倣い、設定は GUI 専用にせず `key = value` 形式のプレーンテキスト
/// ファイルとして持つ。手で編集してもよいし、設定画面から書き換えてもよい。
const CONFIG_FILE_NAME: &str = "textmori.conf";

#[derive(Serialize, Deserialize, Clone)]
pub struct AppConfig {
    #[serde(rename = "font-family")]
    pub font_family: String,
    /// system / light / dark。system は OS の配色設定に追従する。
    pub theme: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            font_family: String::new(),
            theme: "system".to_string(),
        }
    }
}

fn config_path<R: Runtime>(app: &AppHandle<R>) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(CONFIG_FILE_NAME))
}

fn parse(text: &str) -> AppConfig {
    let mut config = AppConfig::default();
    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        let key = key.trim();
        let value = value.trim();
        match key {
            "font-family" => config.font_family = value.to_string(),
            "theme" => {
                if matches!(value, "system" | "light" | "dark") {
                    config.theme = value.to_string();
                }
            }
            _ => {}
        }
    }
    config
}

fn serialize(config: &AppConfig) -> String {
    format!(
        "# textmori 設定ファイル\n\
         # 保存すると自動的に反映されます(アプリの再起動は不要)。\n\
         \n\
         # エディタのフォント。空にするとシステムの既定フォントを使う\n\
         font-family = {}\n\
         \n\
         # 配色: system(OS の設定に追従) / light / dark\n\
         theme = {}\n",
        config.font_family, config.theme,
    )
}

#[tauri::command]
pub fn read_config<R: Runtime>(app: AppHandle<R>) -> Result<AppConfig, String> {
    let path = config_path(&app)?;
    match std::fs::read_to_string(&path) {
        Ok(text) => Ok(parse(&text)),
        Err(_) => {
            let config = AppConfig::default();
            let mut file = std::fs::File::create(&path).map_err(|e| e.to_string())?;
            file.write_all(serialize(&config).as_bytes())
                .map_err(|e| e.to_string())?;
            Ok(config)
        }
    }
}

#[tauri::command]
pub fn write_config<R: Runtime>(app: AppHandle<R>, config: AppConfig) -> Result<(), String> {
    let path = config_path(&app)?;
    std::fs::write(&path, serialize(&config)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn config_file_path<R: Runtime>(app: AppHandle<R>) -> Result<String, String> {
    Ok(config_path(&app)?.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_font_family() {
        let config = parse("font-family = Cascadia Mono\n");
        assert_eq!(config.font_family, "Cascadia Mono");
    }

    #[test]
    fn ignores_comments_and_blank_lines() {
        let config = parse("# comment\n\n  # indented comment\nfont-family = Consolas\n");
        assert_eq!(config.font_family, "Consolas");
    }

    #[test]
    fn ignores_unknown_keys() {
        let config = parse("unknown-key = value\nfont-family = Menlo\n");
        assert_eq!(config.font_family, "Menlo");
    }

    #[test]
    fn defaults_to_empty_font_family_when_absent() {
        let config = parse("");
        assert_eq!(config.font_family, "");
    }

    #[test]
    fn defaults_theme_to_system() {
        let config = parse("");
        assert_eq!(config.theme, "system");
    }

    #[test]
    fn parses_valid_theme_values() {
        assert_eq!(parse("theme = light\n").theme, "light");
        assert_eq!(parse("theme = dark\n").theme, "dark");
        assert_eq!(parse("theme = system\n").theme, "system");
    }

    #[test]
    fn ignores_invalid_theme_value() {
        // 不正な値は既定の system のまま(壊れた設定ファイルでクラッシュしない)
        let config = parse("theme = rainbow\n");
        assert_eq!(config.theme, "system");
    }

    #[test]
    fn serialize_then_parse_roundtrips() {
        let original = AppConfig {
            font_family: "JetBrains Mono".to_string(),
            theme: "dark".to_string(),
        };
        let text = serialize(&original);
        let parsed = parse(&text);
        assert_eq!(parsed.font_family, original.font_family);
        assert_eq!(parsed.theme, original.theme);
    }
}
