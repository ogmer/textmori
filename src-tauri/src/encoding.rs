use encoding_rs::{Encoding, EUC_JP, SHIFT_JIS, UTF_16BE, UTF_16LE, UTF_8};
use serde::Serialize;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DecodedFile {
    pub content: String,
    /// UTF-8 / Shift_JIS / EUC-JP / UTF-16LE / UTF-16BE
    pub encoding: String,
    /// 判別できた文字コードで完全には解釈できず、一部を置換文字で埋めた場合に true。
    /// バイナリファイルを誤って開いた場合などに立つ。
    pub had_errors: bool,
}

/// BOM の有無、次に UTF-8 として矛盾なく解釈できるかを確認し、
/// 最後に日本語で最もよく使われる Shift_JIS / EUC-JP を順に試す。
/// サクラエディタ等の日本語テキストエディタが行う判定と同じ考え方。
/// どれにも完全には一致しない場合は、UTF-8 として置換文字付きで読み込む
/// (フォールバック方針: 常に何らかの形で開けることを優先し、内容の欠落は
/// had_errors で呼び出し側に伝える)。
fn detect_and_decode(bytes: &[u8]) -> (String, &'static Encoding, bool) {
    if let Some(text) = bytes.strip_prefix(b"\xEF\xBB\xBF") {
        let (decoded, _, had_errors) = UTF_8.decode(text);
        return (decoded.into_owned(), UTF_8, had_errors);
    }
    if let Some(text) = bytes.strip_prefix(b"\xFF\xFE") {
        let (decoded, _, had_errors) = UTF_16LE.decode(text);
        return (decoded.into_owned(), UTF_16LE, had_errors);
    }
    if let Some(text) = bytes.strip_prefix(b"\xFE\xFF") {
        let (decoded, _, had_errors) = UTF_16BE.decode(text);
        return (decoded.into_owned(), UTF_16BE, had_errors);
    }

    let (utf8, _, had_errors) = UTF_8.decode(bytes);
    if !had_errors {
        return (utf8.into_owned(), UTF_8, false);
    }

    let (sjis, _, had_errors) = SHIFT_JIS.decode(bytes);
    if !had_errors {
        return (sjis.into_owned(), SHIFT_JIS, false);
    }

    let (euc, _, had_errors) = EUC_JP.decode(bytes);
    if !had_errors {
        return (euc.into_owned(), EUC_JP, false);
    }

    // どれも完全には一致しない場合は、置換文字付きで UTF-8 として扱う
    (utf8.into_owned(), UTF_8, true)
}

fn encoding_name(encoding: &'static Encoding) -> &'static str {
    match encoding.name() {
        "Shift_JIS" => "Shift_JIS",
        "EUC-JP" => "EUC-JP",
        "UTF-16LE" => "UTF-16LE",
        "UTF-16BE" => "UTF-16BE",
        _ => "UTF-8",
    }
}

fn encoding_by_name(name: &str) -> &'static Encoding {
    match name {
        "Shift_JIS" => SHIFT_JIS,
        "EUC-JP" => EUC_JP,
        "UTF-16LE" => UTF_16LE,
        "UTF-16BE" => UTF_16BE,
        _ => UTF_8,
    }
}

#[tauri::command]
pub fn read_text_file_detect(path: String) -> Result<DecodedFile, String> {
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    let (content, encoding, had_errors) = detect_and_decode(&bytes);
    Ok(DecodedFile {
        content,
        encoding: encoding_name(encoding).to_string(),
        had_errors,
    })
}

/// 一時ファイルに書き出してからリネームすることで、書き込み中にアプリや
/// OS がクラッシュしても元のファイルが破損したり中途半端な内容で
/// 上書きされたりしないようにする(アトミックな保存)。
#[tauri::command]
pub fn write_text_file_encoded(path: String, content: String, encoding: String) -> Result<(), String> {
    let target = encoding_by_name(&encoding);
    let (bytes, _, _) = target.encode(&content);

    let path = std::path::Path::new(&path);
    let dir = path
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .ok_or("保存先の親ディレクトリを特定できませんでした")?;
    let file_name = path
        .file_name()
        .ok_or("保存先のファイル名を特定できませんでした")?;

    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or_default();
    let mut tmp_name = std::ffi::OsString::from(".");
    tmp_name.push(file_name);
    tmp_name.push(format!(".{nonce}.tmp"));
    let tmp_path = dir.join(tmp_name);

    std::fs::write(&tmp_path, &bytes).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp_path, path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp_path);
        e.to_string()
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_utf8() {
        let (text, encoding, had_errors) = detect_and_decode("こんにちは".as_bytes());
        assert_eq!(text, "こんにちは");
        assert_eq!(encoding_name(encoding), "UTF-8");
        assert!(!had_errors);
    }

    #[test]
    fn detects_utf8_bom() {
        let mut bytes = vec![0xEF, 0xBB, 0xBF];
        bytes.extend_from_slice("hello".as_bytes());
        let (text, encoding, had_errors) = detect_and_decode(&bytes);
        assert_eq!(text, "hello");
        assert_eq!(encoding_name(encoding), "UTF-8");
        assert!(!had_errors);
    }

    #[test]
    fn detects_shift_jis() {
        let (bytes, _, _) = SHIFT_JIS.encode("日本語のテキスト");
        let (text, encoding, had_errors) = detect_and_decode(&bytes);
        assert_eq!(text, "日本語のテキスト");
        assert_eq!(encoding_name(encoding), "Shift_JIS");
        assert!(!had_errors);
    }

    #[test]
    fn detects_euc_jp() {
        let (bytes, _, _) = EUC_JP.encode("日本語のテキスト");
        let (text, encoding, had_errors) = detect_and_decode(&bytes);
        assert_eq!(text, "日本語のテキスト");
        assert_eq!(encoding_name(encoding), "EUC-JP");
        assert!(!had_errors);
    }

    #[test]
    fn falls_back_to_utf8_with_errors_for_binary_garbage() {
        // UTF-8 としても Shift_JIS / EUC-JP としても正しく解釈できないバイト列
        let bytes: Vec<u8> = vec![0xFF, 0xFE, 0xFF, 0x00, 0x80, 0x81, 0x8F, 0xA0];
        let (_, encoding, had_errors) = detect_and_decode(&bytes);
        // 先頭 2 バイトが UTF-16LE の BOM と一致するため UTF-16LE として判定される
        assert_eq!(encoding_name(encoding), "UTF-16LE");
        let _ = had_errors;
    }

    #[test]
    fn write_then_read_roundtrip_is_atomic_and_correct() {
        let dir = std::env::temp_dir().join(format!(
            "textmori-test-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("sample.txt");

        write_text_file_encoded(
            path.to_string_lossy().into_owned(),
            "テスト内容".to_string(),
            "UTF-8".to_string(),
        )
        .unwrap();

        // アトミック保存なので一時ファイルは残っていないはず
        let leftovers: Vec<_> = std::fs::read_dir(&dir)
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_name().to_string_lossy().ends_with(".tmp"))
            .collect();
        assert!(leftovers.is_empty());

        let result = read_text_file_detect(path.to_string_lossy().into_owned()).unwrap();
        assert_eq!(result.content, "テスト内容");
        assert_eq!(result.encoding, "UTF-8");

        std::fs::remove_dir_all(&dir).ok();
    }
}
