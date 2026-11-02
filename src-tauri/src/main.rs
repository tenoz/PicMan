// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{WindowEvent, CustomMenuItem, Menu, MenuItem, Submenu};

mod archive;
mod image_ops;
mod jpeg_ops;
mod transcode;

fn main() {
    let quit = CustomMenuItem::new("quit", "Quit").accelerator("Command+Q");
    let close = CustomMenuItem::new("close", "Close Window").accelerator("Command+W");

    // 必须保留 macOS 的标准 App 菜单项，否则系统没有可绑定对象：
    // Hide 自带 ⌘H、Hide Others 自带 ⌥⌘H，Show All 用于恢复。
    // 之前只放了 close/quit，把整组标准项替换掉了，⌘H 因此静默失效。
    let app_menu = Menu::new()
        .add_native_item(MenuItem::Hide)
        .add_native_item(MenuItem::HideOthers)
        .add_native_item(MenuItem::ShowAll)
        .add_native_item(MenuItem::Separator)
        .add_item(close)
        .add_native_item(MenuItem::Separator)
        .add_item(quit);

    let menu = Menu::new().add_submenu(Submenu::new("PicMan", app_menu));

    tauri::Builder::default()
        .menu(menu)
        .invoke_handler(tauri::generate_handler![
            image_ops::optimize_png,
            jpeg_ops::encode_jpeg,
            transcode::transcode_to_jpeg,
            archive::zip_directory,
            archive::link_or_copy
        ])
        .on_menu_event(|event| {
            match event.menu_item_id() {
                "quit" => {
                    let window = event.window();
                    window.emit("app-exit-requested", ()).unwrap();
                }
                "close" => {
                    event.window().minimize().unwrap();
                }
                _ => {}
            }
        })
        .on_window_event(|event| {
            match event.event() {
                WindowEvent::CloseRequested { api, .. } => {
                    event.window().minimize().unwrap();
                    api.prevent_close();
                }
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
