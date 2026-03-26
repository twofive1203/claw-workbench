//! Web 远程访问服务模块
//!
//! 提供 HTTP 服务，允许通过浏览器远程访问 ClawWorkbench 前端界面。
//!
//! @author towfive

mod state;
mod auth;
mod router;
mod ws_proxy;
mod dist_resolver;

pub use state::{WebServerInfo, WebServerState};

use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::oneshot;

/// 启动 Web 远程访问服务
#[tauri::command]
pub async fn start_web_server(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<WebServerState>>,
    port: u16,
    access_token: Option<String>,
    gateway_ws_url: String,
    gateway_server_name: String,
) -> Result<WebServerInfo, String> {
    // 检查是否已在运行
    {
        let info = state.info.lock().await;
        if info.running {
            return Err("Web 服务已在运行".to_string());
        }
    }

    // 解析资源目录
    let dist_dir = dist_resolver::resolve_dist_dir(&app)?;

    // 创建关闭信号通道
    let (tx, rx) = oneshot::channel::<()>();

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    // 更新状态
    {
        let mut info = state.info.lock().await;
        info.running = true;
        info.port = port;
        info.access_token = access_token;
        info.started_at = Some(now);
    }
    // 设置网关配置
    {
        let mut config = state.gateway_config.lock().await;
        config.ws_url = gateway_ws_url;
        config.server_name = gateway_server_name;
    }
    {
        let mut shutdown = state.shutdown_tx.lock().await;
        *shutdown = Some(tx);
    }

    // 构建路由并启动服务
    let router = router::build_router(dist_dir, Arc::clone(&state));
    let bind_addr = format!("0.0.0.0:{}", port);
    let listener = tokio::net::TcpListener::bind(&bind_addr)
        .await
        .map_err(|e| format!("绑定端口 {} 失败: {}", port, e))?;

    let state_clone = Arc::clone(&state);
    tokio::spawn(async move {
        let server = axum::serve(listener, router)
            .with_graceful_shutdown(async {
                let _ = rx.await;
            });
        if let Err(e) = server.await {
            log::error!("Web 服务异常退出: {}", e);
        }
        // 服务停止后重置状态
        let mut info = state_clone.info.lock().await;
        info.running = false;
        info.port = 0;
        info.started_at = None;
    });

    let info = state.info.lock().await;
    Ok(info.clone())
}

/// 停止 Web 远程访问服务
#[tauri::command]
pub async fn stop_web_server(
    state: tauri::State<'_, Arc<WebServerState>>,
) -> Result<(), String> {
    let tx = {
        let mut shutdown = state.shutdown_tx.lock().await;
        shutdown.take()
    };
    match tx {
        Some(tx) => {
            let _ = tx.send(());
            Ok(())
        }
        None => Err("Web 服务未在运行".to_string()),
    }
}

/// 查询 Web 服务状态
#[tauri::command]
pub async fn web_server_status(
    state: tauri::State<'_, Arc<WebServerState>>,
) -> Result<WebServerInfo, String> {
    let info = state.info.lock().await;
    Ok(info.clone())
}

/// 更新网关配置
#[tauri::command]
pub async fn update_web_server_gateway(
    state: tauri::State<'_, Arc<WebServerState>>,
    gateway_ws_url: String,
    gateway_server_name: String,
) -> Result<(), String> {
    let mut config = state.gateway_config.lock().await;
    config.ws_url = gateway_ws_url;
    config.server_name = gateway_server_name;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::{Body, to_bytes},
        http::{Request, StatusCode, header},
    };
    use std::{fs, path::{Path, PathBuf}, time::{SystemTime, UNIX_EPOCH}};
    use tower::util::ServiceExt;

    /// 创建测试用静态资源目录。
    fn create_test_dist_dir() -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let dist_dir = std::env::temp_dir().join(format!("clawworkbench-web-test-{}", unique));
        fs::create_dir_all(&dist_dir).expect("创建测试目录失败");
        fs::write(
            dist_dir.join("index.html"),
            "<html><body>openclaw test index</body></html>",
        )
        .expect("写入测试 index.html 失败");
        dist_dir
    }

    /// 清理测试用静态资源目录。
    ///
    /// - `dist_dir`: 待清理目录。
    fn remove_test_dist_dir(dist_dir: &Path) {
        let _ = fs::remove_dir_all(dist_dir);
    }

    /// 构造测试路由。
    ///
    /// - `access_token`: 访问 token。
    async fn build_test_router(access_token: Option<&str>) -> (axum::Router, PathBuf) {
        let dist_dir = create_test_dist_dir();
        let state = Arc::new(WebServerState::default());
        {
            let mut info = state.info.lock().await;
            info.running = true;
            info.started_at = Some(1000);
            info.access_token = access_token.map(str::to_string);
        }
        {
            let mut config = state.gateway_config.lock().await;
            config.ws_url = "ws://127.0.0.1:18789?token=gateway-secret".to_string();
            config.server_name = "测试服务器".to_string();
        }

        (router::build_router(dist_dir.clone(), state), dist_dir)
    }

    #[tokio::test]
    async fn api_status_requires_authorization_header() {
        let (router, dist_dir) = build_test_router(Some("secret-token")).await;

        let unauthorized = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/status")
                    .body(Body::empty())
                    .expect("构造未鉴权请求失败"),
            )
            .await
            .expect("执行未鉴权请求失败");
        assert_eq!(unauthorized.status(), StatusCode::UNAUTHORIZED);

        let authorized = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/status")
                    .header(header::AUTHORIZATION, "Bearer secret-token")
                    .body(Body::empty())
                    .expect("构造 Bearer 请求失败"),
            )
            .await
            .expect("执行 Bearer 请求失败");
        assert_eq!(authorized.status(), StatusCode::OK);

        let query_authorized = router
            .oneshot(
                Request::builder()
                    .uri("/api/status?token=secret-token")
                    .body(Body::empty())
                    .expect("构造 query token 请求失败"),
            )
            .await
            .expect("执行 query token 请求失败");
        assert_eq!(query_authorized.status(), StatusCode::UNAUTHORIZED);

        remove_test_dist_dir(&dist_dir);
    }

    #[tokio::test]
    async fn ws_route_allows_query_token_auth() {
        let (router, dist_dir) = build_test_router(Some("secret-token")).await;

        let response = router
            .oneshot(
                Request::builder()
                    .uri("/ws?token=secret-token")
                    .body(Body::empty())
                    .expect("构造 ws query token 请求失败"),
            )
            .await
            .expect("执行 ws query token 请求失败");
        assert_ne!(response.status(), StatusCode::UNAUTHORIZED);

        remove_test_dist_dir(&dist_dir);
    }

    #[tokio::test]
    async fn api_config_hides_gateway_token() {
        let (router, dist_dir) = build_test_router(Some("secret-token")).await;

        let response = router
            .oneshot(
                Request::builder()
                    .uri("/api/config")
                    .header(header::AUTHORIZATION, "Bearer secret-token")
                    .body(Body::empty())
                    .expect("构造 api config 请求失败"),
            )
            .await
            .expect("执行 api config 请求失败");
        assert_eq!(response.status(), StatusCode::OK);

        let body = to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("读取 api config 响应失败");
        let text = String::from_utf8(body.to_vec()).expect("api config 响应不是合法 UTF-8");
        assert!(!text.contains("gateway-secret"));
        assert!(!text.contains("?token="));

        remove_test_dist_dir(&dist_dir);
    }

    #[tokio::test]
    async fn static_routes_fallback_to_index_html() {
        let (router, dist_dir) = build_test_router(Some("secret-token")).await;

        let response = router
            .oneshot(
                Request::builder()
                    .uri("/missing-route")
                    .body(Body::empty())
                    .expect("构造静态路由请求失败"),
            )
            .await
            .expect("执行静态路由请求失败");
        assert_eq!(response.status(), StatusCode::OK);

        let body = to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("读取静态路由响应失败");
        let text = String::from_utf8(body.to_vec()).expect("静态路由响应不是合法 UTF-8");
        assert!(text.contains("openclaw test index"));

        remove_test_dist_dir(&dist_dir);
    }
}
