use serde::{Deserialize, Serialize};
use std::io::Write;
use tauri::{AppHandle, Manager, Runtime};

/// Ghostty に倣い、設定は GUI 専用にせず `key = value` 形式のプレーンテキスト
/// ファイルとして持つ。手で編集してもよいし、設定画面から書き換えてもよい。
const CONFIG_FILE_NAME: &str = "textmori.conf";

#[derive(Serialize, Deserialize, Clone)]
pub struct AppConfig {
    #[serde(rename = "auto-update")]
    pub auto_update: bool,
    #[serde(rename = "font-family")]
    pub font_family: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            auto_update: true,
            font_family: String::new(),
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
            "auto-update" => config.auto_update = value.eq_ignore_ascii_case("true"),
            "font-family" => config.font_family = value.to_string(),
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
         # 起動時に自動でアップデートを確認する (true / false)\n\
         auto-update = {}\n\
         \n\
         # エディタのフォント。空にするとシステムの既定フォントを使う\n\
         font-family = {}\n",
        config.auto_update, config.font_family,
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
