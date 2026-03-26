//! 前端静态资源目录解析
//!
//! @author towfive

use tauri::{Manager, path::BaseDirectory};
use std::path::{Path, PathBuf};

/// 记录已检查的路径（去重）。
///
/// - `checked_paths`: 已检查路径列表。
/// - `path`: 本次要记录的路径。
fn push_checked_path(checked_paths: &mut Vec<String>, path: &Path) {
    let path_str = path.display().to_string();
    if !checked_paths.iter().any(|item| item == &path_str) {
        checked_paths.push(path_str);
    }
}

/// 尝试将候选目录识别为前端资源目录。
///
/// 判定条件：目录下存在 `index.html`。
///
/// - `candidate`: 候选目录路径。
/// - `checked_paths`: 已检查路径列表（用于错误提示）。
fn try_dist_candidate(candidate: PathBuf, checked_paths: &mut Vec<String>) -> Option<PathBuf> {
    push_checked_path(checked_paths, &candidate);
    if candidate.is_dir() && candidate.join("index.html").is_file() {
        Some(candidate)
    } else {
        None
    }
}

/// 解析前端静态资源目录。
///
/// 查找顺序：
/// 1. Tauri 资源目录（`resource_dir/dist`、`resource_dir`）。
/// 2. Tauri 资源解析器定位到的 `index.html` 所在目录。
/// 3. 当前工作目录推导（`./dist`、`../dist`）。
/// 4. Cargo 清单目录推导（`CARGO_MANIFEST_DIR/../dist`）。
/// 5. 可执行文件目录推导（`./dist`、`../dist`）。
///
/// - `app_handle`: Tauri 应用句柄，用于解析运行时资源路径。
pub(super) fn resolve_dist_dir(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let mut checked_paths: Vec<String> = Vec::new();

    // 优先尝试 Tauri 资源目录（发布模式最常见）。
    if let Ok(resource_dir) = app_handle.path().resource_dir() {
        if let Some(dist) = try_dist_candidate(resource_dir.join("dist"), &mut checked_paths) {
            return Ok(dist);
        }
        if let Some(dist) = try_dist_candidate(resource_dir.clone(), &mut checked_paths) {
            return Ok(dist);
        }
    }

    // 使用 Tauri 的资源解析器兜底，适配不同平台资源布局（如 _up_ 子目录）。
    if let Ok(index_path) = app_handle
        .path()
        .resolve("index.html", BaseDirectory::Resource)
    {
        if let Some(parent) = index_path.parent() {
            if let Some(dist) = try_dist_candidate(parent.to_path_buf(), &mut checked_paths) {
                return Ok(dist);
            }
        } else {
            push_checked_path(&mut checked_paths, &index_path);
        }
    }

    // 开发模式回退：从当前工作目录推导。
    if let Ok(current_dir) = std::env::current_dir() {
        if let Some(dist) = try_dist_candidate(current_dir.join("dist"), &mut checked_paths) {
            return Ok(dist);
        }
        if let Some(dist) = try_dist_candidate(current_dir.join("../dist"), &mut checked_paths) {
            return Ok(dist);
        }
    }

    // 开发模式回退：从 Cargo 清单目录推导（src-tauri/../dist）。
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    if let Some(dist) = try_dist_candidate(manifest_dir.join("../dist"), &mut checked_paths) {
        return Ok(dist);
    }

    // 兜底：从可执行文件目录推导（适配部分手动启动场景）。
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            if let Some(dist) = try_dist_candidate(exe_dir.join("dist"), &mut checked_paths) {
                return Ok(dist);
            }
            if let Some(dist) = try_dist_candidate(exe_dir.join("../dist"), &mut checked_paths) {
                return Ok(dist);
            }
        }
    }

    let checked_text = checked_paths.join(" | ");
    Err(format!(
        "未找到前端资源目录（dist/），请先执行 pnpm build。已检查路径：{}",
        checked_text
    ))
}
