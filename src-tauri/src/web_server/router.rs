//! Axum 路由构建与 API 处理器
//!
//! @author towfive

use axum::{
    Router,
    extract::State,
    middleware,
    response::Json,
    routing::get,
};
use serde::Serialize;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tower_http::services::{ServeDir, ServeFile};

use super::auth::{api_auth_middleware, ws_auth_middleware};
use super::state::WebServerState;
use super::ws_proxy::{strip_ws_url_query, ws_proxy_upgrade};

/// /api/config 响应（驼峰命名）
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ConfigResponse {
    ws_url: String,
    server_name: String,
}

/// /api/status 响应
#[derive(Serialize)]
struct StatusResponse {
    ok: bool,
    uptime: u64,
    version: &'static str,
}

/// 返回网关配置
async fn api_config(State(state): State<Arc<WebServerState>>) -> Json<ConfigResponse> {
    let config = state.gateway_config.lock().await;
    Json(ConfigResponse {
        ws_url: strip_ws_url_query(&config.ws_url),
        server_name: config.server_name.clone(),
    })
}

/// 返回服务状态
async fn api_status(State(state): State<Arc<WebServerState>>) -> Json<StatusResponse> {
    let info = state.info.lock().await;
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
    let uptime = info.started_at.map_or(0, |s| now.saturating_sub(s) / 1000);
    Json(StatusResponse {
        ok: true,
        uptime,
        version: env!("CARGO_PKG_VERSION"),
    })
}

/// 构建 Axum 路由
///
/// - `/api/config` → 网关配置（仅允许 Authorization 头鉴权）
/// - `/api/status` → 服务状态（仅允许 Authorization 头鉴权）
/// - `/ws` → WebSocket 代理（允许 Authorization 或 query token 鉴权）
/// - `/*` → 静态文件服务（无需鉴权，SPA fallback 到 index.html）
pub(super) fn build_router(dist_dir: PathBuf, state: Arc<WebServerState>) -> Router {
    let index_html = dist_dir.join("index.html");

    // SPA 静态文件服务：未匹配的路径 fallback 到 index.html
    let serve_dir = ServeDir::new(&dist_dir).fallback(ServeFile::new(&index_html));

    // API 路由（带鉴权中间件）
    let api_routes = Router::new()
        .route("/api/config", get(api_config))
        .route("/api/status", get(api_status))
        .layer(middleware::from_fn_with_state(state.clone(), api_auth_middleware))
        .with_state(state.clone());

    let ws_routes = Router::new()
        .route("/ws", get(ws_proxy_upgrade))
        .layer(middleware::from_fn_with_state(state.clone(), ws_auth_middleware))
        .with_state(state.clone());

    // 合并：WebSocket 代理路由 + API 路由 + 静态文件。
    //
    // 说明：
    // - `/api/*` 只接受 Authorization 头，减少 query token 暴露；
    // - `/ws` 使用 Web 访问 token 进入代理，再由代理改写 connect.auth.token 为真实网关 token；
    // - 浏览器侧不再感知网关 token，网关 token 仅保留在桌面端 Rust 进程内。
    ws_routes
        .merge(api_routes)
        .fallback_service(serve_dir)
}
