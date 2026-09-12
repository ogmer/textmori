use tauri::Manager;

mod config;
mod encoding;

#[cfg(target_os = "macos")]
use tauri::menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem, Submenu};
#[cfg(target_os = "macos")]
use tauri::{AppHandle, Emitter, Runtime};

// macOS はメニューがウィンドウではなく画面上部に出るため、ネイティブメニューを維持する。
// Windows / Linux はメモ帳と同じくタブ行とメニュー行を HTML 側で描画する。
#[cfg(target_os = "macos")]
fn build_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let app_menu = Submenu::with_items(
        app,
        "textmori",
        true,
        &[
            &PredefinedMenuItem::about(app, None, None)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "settings", "設定...", true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::services(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, None)?,
            &PredefinedMenuItem::hide_others(app, None)?,
            &PredefinedMenuItem::show_all(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, None)?,
        ],
    )?;

    let file_menu = Submenu::with_items(
        app,
        "ファイル",
        true,
        &[
            // アクセラレータは付けない。キーボードショートカットは JS 側
            // (handleKeydown)が全 OS 共通で処理するため、ここで登録すると
            // メニューのネイティブアクセラレータと二重発火するおそれがある。
            &MenuItem::with_id(app, "new", "新規タブ", true, None::<&str>)?,
            &MenuItem::with_id(app, "open", "開く...", true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "save", "保存", true, None::<&str>)?,
            &MenuItem::with_id(app, "save_as", "名前を付けて保存...", true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "close_tab", "タブを閉じる", true, None::<&str>)?,
        ],
    )?;

    let edit_menu = Submenu::with_items(
        app,
        "編集",
        true,
        &[
            &PredefinedMenuItem::undo(app, Some("元に戻す"))?,
            &PredefinedMenuItem::redo(app, Some("やり直し"))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, Some("切り取り"))?,
            &PredefinedMenuItem::copy(app, Some("コピー"))?,
            &PredefinedMenuItem::paste(app, Some("貼り付け"))?,
            &PredefinedMenuItem::select_all(app, Some("すべて選択"))?,
        ],
    )?;

    let view_menu = Submenu::with_items(
        app,
        "表示",
        true,
        &[
            &MenuItem::with_id(app, "zoom_in", "拡大", true, None::<&str>)?,
            &MenuItem::with_id(app, "zoom_out", "縮小", true, None::<&str>)?,
            &MenuItem::with_id(app, "zoom_reset", "既定のサイズに戻す", true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "toggle_wrap", "行の折り返し", true, None::<&str>)?,
        ],
    )?;

    Menu::with_items(app, &[&app_menu, &file_menu, &edit_menu, &view_menu])
}

#[cfg(target_os = "macos")]
fn handle_menu_event<R: Runtime>(app: &AppHandle<R>, event: MenuEvent) {
    let _ = app.emit("menu-action", event.id().as_ref());
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            encoding::read_text_file_detect,
            encoding::write_text_file_encoded,
            config::read_config,
            config::write_config,
            config::config_file_path,
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                let menu = build_menu(app.handle())?;
                app.set_menu(menu)?;
            }
            #[cfg(not(target_os = "macos"))]
            if let Some(window) = app.get_webview_window("main") {
                window.set_decorations(false)?;
            }
            Ok(())
        });

    #[cfg(target_os = "macos")]
    let builder = builder.on_menu_event(handle_menu_event);

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
