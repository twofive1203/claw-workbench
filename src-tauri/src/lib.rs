use std::sync::Arc;
use std::{fs, path::Path, path::PathBuf};
use base64::{Engine as _, engine::general_purpose::STANDARD};
use tauri::{
  Manager,
  menu::{Menu, MenuItem, PredefinedMenuItem},
  tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};

mod web_server;

/// 触发 Windows 任务栏图标闪烁（获得焦点后自动停止）。
/// 非 Windows 平台为空操作。
#[tauri::command]
fn flash_window(window: tauri::WebviewWindow) {
  #[cfg(target_os = "windows")]
  {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
      FlashWindowEx, FLASHWINFO, FLASHW_TIMERNOFG, FLASHW_TRAY,
    };
    if let Ok(hwnd) = window.hwnd() {
      let info = FLASHWINFO {
        cbSize: std::mem::size_of::<FLASHWINFO>() as u32,
        hwnd: hwnd.0 as _,
        // 仅闪烁任务栏按钮，窗口获得焦点后自动停止
        dwFlags: FLASHW_TRAY | FLASHW_TIMERNOFG,
        uCount: 5,
        dwTimeout: 0,
      };
      unsafe {
        FlashWindowEx(&info);
      }
    }
  }
  #[cfg(not(target_os = "windows"))]
  let _ = window;
}

/// 将网关本地图片路径读取为 data URL，供前端内嵌显示。
/// 仅允许读取 `$HOME/.openclaw` 目录下的图片，防止越权访问。
/// @param app Tauri AppHandle，用于获取用户目录。
/// @param path 图片绝对路径或 file:// 路径。
#[tauri::command]
fn resolve_media_path_to_data_url(app: tauri::AppHandle, path: String) -> Result<String, String> {
  const MAX_BYTES: usize = 10 * 1024 * 1024;

  fn normalize_path(raw: &str) -> PathBuf {
    let trimmed = raw.trim();
    if let Some(rest) = trimmed.strip_prefix("file://") {
      if cfg!(windows) {
        let normalized = rest.trim_start_matches('/');
        return PathBuf::from(normalized);
      }
      return PathBuf::from(rest);
    }
    PathBuf::from(trimmed)
  }

  fn resolve_image_mime(path: &Path) -> Option<&'static str> {
    let ext = path
      .extension()
      .and_then(|value| value.to_str())
      .map(|value| value.to_ascii_lowercase())?;
    match ext.as_str() {
      "png" => Some("image/png"),
      "jpg" | "jpeg" => Some("image/jpeg"),
      "webp" => Some("image/webp"),
      "gif" => Some("image/gif"),
      "bmp" => Some("image/bmp"),
      "svg" => Some("image/svg+xml"),
      "avif" => Some("image/avif"),
      "heic" | "heif" => Some("image/heif"),
      _ => None,
    }
  }

  let home_dir = app
    .path()
    .home_dir()
    .map_err(|err| format!("读取用户目录失败: {err}"))?;
  let allowed_root = home_dir.join(".openclaw");
  let allowed_root = fs::canonicalize(&allowed_root)
    .map_err(|_| format!("允许目录不存在: {}", allowed_root.display()))?;

  let normalized = normalize_path(&path);
  if !normalized.is_absolute() {
    return Err("仅支持绝对路径".to_string());
  }

  let canonical = fs::canonicalize(&normalized)
    .map_err(|_| format!("文件不存在: {}", normalized.display()))?;
  if !canonical.starts_with(&allowed_root) {
    return Err("路径不在允许目录中".to_string());
  }

  let mime = resolve_image_mime(&canonical)
    .ok_or_else(|| format!("不支持的图片类型: {}", canonical.display()))?;

  let bytes = fs::read(&canonical)
    .map_err(|_| format!("读取文件失败: {}", canonical.display()))?;
  if bytes.is_empty() {
    return Err("图片文件为空".to_string());
  }
  if bytes.len() > MAX_BYTES {
    return Err(format!("图片过大，超过 {} MB", MAX_BYTES / (1024 * 1024)));
  }

  let encoded = STANDARD.encode(bytes);
  Ok(format!("data:{mime};base64,{encoded}"))
}

/// 使用系统默认浏览器打开外部链接。
/// 仅允许 http/https 协议，避免打开不受信任协议。
/// @param url 目标链接地址。
#[tauri::command]
fn open_external_url(url: String) -> Result<bool, String> {
  let trimmed = url.trim();
  if trimmed.is_empty() {
    return Err("链接不能为空".to_string());
  }

  let normalized = trimmed.to_ascii_lowercase();
  if !normalized.starts_with("http://") && !normalized.starts_with("https://") {
    return Err("仅支持打开 http/https 链接".to_string());
  }

  #[cfg(target_os = "windows")]
  let status = std::process::Command::new("cmd")
    .args(["/C", "start", "", trimmed])
    .status()
    .map_err(|err| format!("打开浏览器失败: {err}"))?;

  #[cfg(target_os = "macos")]
  let status = std::process::Command::new("open")
    .arg(trimmed)
    .status()
    .map_err(|err| format!("打开浏览器失败: {err}"))?;

  #[cfg(all(unix, not(target_os = "macos")))]
  let status = std::process::Command::new("xdg-open")
    .arg(trimmed)
    .status()
    .map_err(|err| format!("打开浏览器失败: {err}"))?;

  if !status.success() {
    return Err("系统未成功启动外部浏览器".to_string());
  }

  Ok(true)
}

/// 将文本内容写入用户指定的文件路径。
/// 仅用于用户主动触发的导出操作。
/// @param path 目标文件绝对路径。
/// @param content 需要写入的 UTF-8 文本内容。
#[tauri::command]
fn save_text_file(path: String, content: String) -> Result<bool, String> {
  let trimmed = path.trim();
  if trimmed.is_empty() {
    return Err("保存路径不能为空".to_string());
  }

  let target = PathBuf::from(trimmed);
  if !target.is_absolute() {
    return Err("保存路径必须为绝对路径".to_string());
  }

  let parent = target
    .parent()
    .ok_or_else(|| "保存路径无效".to_string())?;
  if !parent.exists() {
    return Err(format!("保存目录不存在: {}", parent.display()));
  }

  fs::write(&target, content).map_err(|err| format!("写入文件失败: {err}"))?;
  Ok(true)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    // 单实例保护：必须最先注册，第二个实例启动时恢复已有窗口
    .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
      if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
      }
    }))
    .plugin(tauri_plugin_notification::init())
    .plugin(tauri_plugin_store::Builder::new().build())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_dialog::init())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      // 创建托盘菜单
      let show_i = MenuItem::with_id(app, "show", "显示窗口", true, None::<&str>)?;
      let hide_i = MenuItem::with_id(app, "hide", "隐藏窗口", true, None::<&str>)?;
      let sep = PredefinedMenuItem::separator(app)?;
      let quit_i = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
      let menu = Menu::with_items(app, &[&show_i, &hide_i, &sep, &quit_i])?;

      // 创建托盘图标
      let _tray = TrayIconBuilder::with_id("main-tray")
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip("ClawWorkbench")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
          "show" => {
            if let Some(window) = app.get_webview_window("main") {
              let _ = window.unminimize();
              let _ = window.show();
              let _ = window.set_focus();
            }
          }
          "hide" => {
            if let Some(window) = app.get_webview_window("main") {
              let _ = window.hide();
            }
          }
          "quit" => {
            // 退出前优雅关闭 Web 服务
            if let Some(state) = app.try_state::<Arc<web_server::WebServerState>>() {
              let mut shutdown = state.shutdown_tx.blocking_lock();
              if let Some(tx) = shutdown.take() {
                let _ = tx.send(());
              }
            }
            app.exit(0);
          }
          _ => {}
        })
        .on_tray_icon_event(|tray, event| {
          if let TrayIconEvent::Click {
            button: MouseButton::Left,
            button_state: MouseButtonState::Up,
            ..
          } = event
          {
            let app = tray.app_handle();
            if let Some(window) = app.get_webview_window("main") {
              if window.is_visible().unwrap_or(false) {
                let _ = window.hide();
              } else {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
              }
            }
          }
        })
        .build(app)?;

      // 拦截窗口关闭事件：隐藏窗口而非退出
      if let Some(window) = app.get_webview_window("main") {
        let window_clone = window.clone();
        window.on_window_event(move |event| {
          if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = window_clone.hide();
          }
        });
      }

      Ok(())
    })
    .manage(Arc::new(web_server::WebServerState::default()))
    .invoke_handler(tauri::generate_handler![
      flash_window,
      resolve_media_path_to_data_url,
      open_external_url,
      save_text_file,
      web_server::start_web_server,
      web_server::stop_web_server,
      web_server::web_server_status,
      web_server::update_web_server_gateway,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
