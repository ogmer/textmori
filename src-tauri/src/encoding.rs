use encoding_rs::{Encoding, EUC_JP, SHIFT_JIS, UTF_16BE, UTF_16LE, UTF_8};
use serde::Serialize;

#[derive(Serialize)]
pub struct DecodedFile {
    pub content: String,
    /// UTF-8 / Shift_JIS / EUC-JP / UTF-16LE / UTF-16BE
    pub encoding: String,
}

/// BOM の有無、次に UTF-8 として矛盾なく解釈できるかを確認し、
/// 最後に日本語で最もよく使われる Shift_JIS / EUC-JP を順に試す。
/// サクラエディタ等の日本語テキストエディタが行う判定と同じ考え方。
fn detect_and_decode(bytes: &[u8]) -> (String, &'static Encoding) {
    if let Some(text) = bytes.strip_prefix(b"\xEF\xBB\xBF") {
        let (decoded, _, _) = UTF_8.decode(text);
        return (decoded.into_owned(), UTF_8);
    }
    if let Some(text) = bytes.strip_prefix(b"\xFF\xFE") {
        let (decoded, _, _) = UTF_16LE.decode(text);
        return (decoded.into_owned(), UTF_16LE);
    }
    if let Some(text) = bytes.strip_prefix(b"\xFE\xFF") {
        let (decoded, _, _) = UTF_16BE.decode(text);
        return (decoded.into_owned(), UTF_16BE);
    }

    let (utf8, _, had_errors) = UTF_8.decode(bytes);
    if !had_errors {
        return (utf8.into_owned(), UTF_8);
    }

    let (sjis, _, had_errors) = SHIFT_JIS.decode(bytes);
    if !had_errors {
        return (sjis.into_owned(), SHIFT_JIS);
    }

    let (euc, _, had_errors) = EUC_JP.decode(bytes);
    if !had_errors {
        return (euc.into_owned(), EUC_JP);
    }

    // どれも完全には一致しない場合は、置換文字付きで UTF-8 として扱う
    (utf8.into_owned(), UTF_8)
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
    let (content, encoding) = detect_and_decode(&bytes);
    Ok(DecodedFile {
        content,
        encoding: encoding_name(encoding).to_string(),
    })
}

#[tauri::command]
pub fn write_text_file_encoded(path: String, content: String, encoding: String) -> Result<(), String> {
    let target = encoding_by_name(&encoding);
    let (bytes, _, _) = target.encode(&content);
    std::fs::write(&path, bytes).map_err(|e| e.to_string())
}
