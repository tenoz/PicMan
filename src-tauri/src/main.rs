// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{Manager, WindowEvent, RunEvent};

fn main() {
    let app = tauri::Builder::default()
        .on_window_event(|event| {
            match event.event() {
                // Cmd+W 或点击关闭按钮时，隐藏窗口而不是退出
                WindowEvent::CloseRequested { api, .. } => {
                    #[cfg(target_os = "macos")]
                    {
                        event.window().hide().unwrap();
                        api.prevent_close();
                    }
                }
                _ => {}
            }
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application");

    app.run(|_app_handle, event| {
        match event {
            // 应用即将退出时的事件
            RunEvent::ExitRequested { api, .. } => {
                // 这里可以添加逻辑来检查是否应该阻止退出
                // 由于需要与前端通信，我们使用自定义的退出处理
            }
            _ => {}
        }
    });
}
