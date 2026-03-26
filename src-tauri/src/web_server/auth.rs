//! 访问令牌鉴权中间件
//!
//! @author towfive

use axum::{
    extract::{Request, State},
    http::{HeaderMap, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
};
use std::sync::Arc;

use super::state::WebServerState;

/// 从查询串中提取指定参数。
///
/// - `query`: 原始查询串。
/// - `key`: 参数名。
pub(super) fn extract_query_value(query: &str, key: &str) -> Option<String> {
    query
        .split('&')
        .find_map(|pair| {
            let (candidate_key, candidate_value) = pair.split_once('=')?;
            if candidate_key == key {
                Some(candidate_value.to_string())
            } else {
                None
            }
        })
}

/// 从请求头提取 Bearer token。
///
/// - `headers`: 请求头。
fn extract_bearer_token(headers: &HeaderMap) -> Option<String> {
    headers
        .get("authorization")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .map(|value| value.to_string())
}

/// 从请求 URL 中提取 query token。
///
/// - `request`: HTTP 请求。
fn extract_request_query_token(request: &Request) -> Option<String> {
    request
        .uri()
        .query()
        .and_then(|query| extract_query_value(query, "token"))
}

/// 执行统一的访问 token 鉴权。
///
/// - `state`: Web 服务共享状态。
/// - `headers`: 请求头。
/// - `request`: HTTP 请求。
/// - `next`: 下游处理器。
/// - `allow_query_token`: 是否允许 query token 鉴权。
async fn run_access_token_auth(
    State(state): State<Arc<WebServerState>>,
    headers: HeaderMap,
    request: Request,
    next: Next,
    allow_query_token: bool,
) -> Response {
    let info = state.info.lock().await;
    let expected_token = match &info.access_token {
        Some(t) => t.clone(),
        // 未设置 token，跳过鉴权
        None => {
            drop(info);
            return next.run(request).await;
        }
    };
    drop(info);

    let provided = extract_bearer_token(&headers).or_else(|| {
        if allow_query_token {
            extract_request_query_token(&request)
        } else {
            None
        }
    });

    match provided {
        Some(t) if t == expected_token => next.run(request).await,
        _ => StatusCode::UNAUTHORIZED.into_response(),
    }
}

/// API 鉴权中间件。
///
/// 仅允许 Authorization 头，避免在 `/api/*` 上继续暴露 query token。
pub(super) async fn api_auth_middleware(
    state: State<Arc<WebServerState>>,
    headers: HeaderMap,
    request: Request,
    next: Next,
) -> Response {
    run_access_token_auth(state, headers, request, next, false).await
}

/// WebSocket 鉴权中间件。
///
/// 浏览器原生 WebSocket 无法方便地携带 Authorization 头，因此保留 query token。
pub(super) async fn ws_auth_middleware(
    state: State<Arc<WebServerState>>,
    headers: HeaderMap,
    request: Request,
    next: Next,
) -> Response {
    run_access_token_auth(state, headers, request, next, true).await
}
