#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(target_os = "macos")]
use tauri::Manager;
use tauri::{menu::Menu, webview::NewWindowResponse, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt;

mod navigation;

fn open_external(app: &tauri::AppHandle, url: &tauri::Url) {
    if navigation::is_external_url(url) {
        // Never log URLs: future links could contain user data in their query.
        if app.opener().open_url(url.as_str(), None::<&str>).is_err() {
            eprintln!("Could not open the link in the system browser.");
        }
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_opener::Builder::new()
                .open_js_links_on_click(false)
                .build(),
        )
        .setup(|app| {
            let navigation_app = app.handle().clone();
            let popup_app = app.handle().clone();
            let dev_url = if tauri::is_dev() {
                app.config().build.dev_url.clone()
            } else {
                None
            };
            WebviewWindowBuilder::from_config(app, &app.config().app.windows[0])?
                .on_navigation(move |url| {
                    if navigation::is_app_url(url, dev_url.as_ref()) {
                        return true;
                    }
                    open_external(&navigation_app, url);
                    false
                })
                .on_new_window(move |url, _| {
                    open_external(&popup_app, &url);
                    NewWindowResponse::Deny
                })
                .build()?;
            // Native edit commands keep copy/paste and select-all working in settings.
            app.set_menu(Menu::default(app.handle())?)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            #[cfg(target_os = "macos")]
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // Closing the Mac window preserves the session; Cmd+Q quits the app.
                if window.hide().is_ok() {
                    api.prevent_close();
                }
            }
            #[cfg(not(target_os = "macos"))]
            let _ = (window, event);
        })
        .build(tauri::generate_context!())
        .expect("could not initialize Pokotype")
        .run(|app, event| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = event {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            #[cfg(not(target_os = "macos"))]
            let _ = (app, event);
        });
}
