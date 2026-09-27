// ==============================================================================
// Imports
// ==============================================================================
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::{TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewWindow};

// ==============================================================================
// Types
// ==============================================================================
pub struct TrayState {
    pub overlayMode: AtomicBool,
}

// ==============================================================================
// Constants
// ==============================================================================
const DEFAULT_WINDOW_WIDTH: u32 = 1280;
const DEFAULT_WINDOW_HEIGHT: u32 = 800;
const HUD_WINDOW_WIDTH: u32 = 380;
const HUD_WINDOW_HEIGHT: u32 = 540;

// ==============================================================================
// Functions
// ==============================================================================

// Initializes system tray icon and menu actions
pub fn setupSystemTray(app: &AppHandle, trayState: Arc<TrayState>) -> Result<(), Box<dyn std::error::Error>> {
    let showItem = MenuItemBuilder::with_id("show", "Show Fixture").build(app)?;
    let toggleOverlayItem = MenuItemBuilder::with_id("toggle_overlay", "Toggle Overlay Mode").build(app)?;
    let quitItem = MenuItemBuilder::with_id("quit", "Quit Fixture").build(app)?;

    let menu = MenuBuilder::new(app)
        .items(&[&showItem, &toggleOverlayItem, &quitItem])
        .build()?;

    let iconBytes = include_bytes!("../../icons/128x128.png");
    let trayIcon = tauri::image::Image::from_bytes(iconBytes)?;

    let appHandle = app.clone();
    let state = trayState.clone();

    let _tray = TrayIconBuilder::new()
        .icon(trayIcon)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(move |_app, event| {
            let id = event.id.as_ref();
            match id {
                "show" => {
                    if let Some(window) = appHandle.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                "toggle_overlay" => {
                    let current = state.overlayMode.load(Ordering::SeqCst);
                    let next = !current;
                    state.overlayMode.store(next, Ordering::SeqCst);
                    if let Some(window) = appHandle.get_webview_window("main") {
                        let _ = applyOverlayMode(&window, next, None);
                    }
                }
                "quit" => {
                    appHandle.exit(0);
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: tauri::tray::MouseButton::Left, .. } = event {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    let isVisible = window.is_visible().unwrap_or(false);
                    if isVisible {
                        let _ = window.hide();
                    } else {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            }
        })
        .build(app)?;

    Ok(())
}

// Configures window attributes and bounds for overlay mode vs desktop mode
pub fn applyOverlayMode(
    window: &WebviewWindow,
    enabled: bool,
    variant: Option<&str>,
) -> Result<(), tauri::Error> {
    if enabled {
        let v = variant.unwrap_or("floating-hud");
        window.set_always_on_top(true)?;
        window.set_skip_taskbar(true)?;

        if let Ok(Some(monitor)) = window.current_monitor() {
            let monitorSize = monitor.size();
            let (targetWidth, targetHeight) = match v {
                "mini-pill" => (260, 60),
                "docked-sidebar" => (340, monitorSize.height),
                _ => (HUD_WINDOW_WIDTH, HUD_WINDOW_HEIGHT),
            };

            let _ = window.unmaximize();
            let _ = window.set_size(PhysicalSize::new(targetWidth, targetHeight));

            let posX = if v == "docked-sidebar" {
                (monitorSize.width as i32) - (targetWidth as i32)
            } else {
                (monitorSize.width as i32) - (targetWidth as i32) - 40
            };
            let posY = if v == "docked-sidebar" {
                0
            } else {
                50
            };

            let _ = window.set_position(PhysicalPosition::new(posX, posY));
        }

        window.show()?;
        let _ = window.set_focus();
    } else {
        window.set_always_on_top(false)?;
        window.set_skip_taskbar(false)?;
        let _ = window.set_size(PhysicalSize::new(DEFAULT_WINDOW_WIDTH, DEFAULT_WINDOW_HEIGHT));
        let _ = window.center();
        window.show()?;
        let _ = window.set_focus();
    }
    Ok(())
}
