// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{WindowEvent, CustomMenuItem, Menu, MenuItem, Submenu, Manager};

fn main() {
    // Create menu with Quit item that has accelerator
    let quit = CustomMenuItem::new("quit", "Quit").accelerator("Command+Q");
    let hide = CustomMenuItem::new("hide", "Hide").accelerator("Command+H");
    let close = CustomMenuItem::new("close", "Close").accelerator("Command+W");
    
    let app_menu = Menu::new()
        .add_native_item(MenuItem::Separator)
        .add_item(hide)
        .add_item(close)
        .add_native_item(MenuItem::Separator)
        .add_item(quit);

    let menu = Menu::new().add_submenu(Submenu::new("PicMan", app_menu));

    tauri::Builder::default()
        .menu(menu)
        .on_menu_event(|event| {
            match event.menu_item_id() {
                "quit" => {
                    let window = event.window();
                    window.emit("app-exit-requested", ()).unwrap();
                }
                "hide" => {
                    event.window().hide().unwrap();
                }
                "close" => {
                    event.window().hide().unwrap();
                }
                _ => {}
            }
        })
        .on_window_event(|event| {
            match event.event() {
                WindowEvent::CloseRequested { api, .. } => {
                    event.window().hide().unwrap();
                    api.prevent_close();
                }
                // When window gets focus (e.g., clicking Dock icon), show it
                WindowEvent::Focused(focused) => {
                    if *focused {
                        let _ = event.window().show();
                    }
                }
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
