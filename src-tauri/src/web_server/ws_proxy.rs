//! WebSocket 双向代理核心逻辑
//!
//! 将浏览器连接转发到当前配置的网关 ws 地址，避免浏览器直接访问内网端口失败。
//!
//! @author towfive

use axum::{
    extract::{State, ws::{Message as AxumWsMessage, WebSocket, WebSocketUpgrade}},
    http::{HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
};
use futures_util::{SinkExt, StreamExt};
use serde_json::{Value, json};
use std::sync::Arc;
use tokio_tungstenite::{
    connect_async,
    tungstenite::{Message as TungsteniteMessage, client::IntoClientRequest},
};

use super::auth::extract_query_value;
use super::state::WebServerState;

/// 去掉网关地址中的查询串，避免将网关 token 暴露给远程前端。
///
/// - `ws_url`: 原始网关地址。
pub(super) fn strip_ws_url_query(ws_url: &str) -> String {
    ws_url
        .split('?')
        .next()
        .unwrap_or(ws_url)
        .to_string()
}

/// 从网关地址中提取 token，用于代理层重写 connect 请求。
///
/// - `gateway_ws_url`: 原始网关地址。
fn extract_gateway_token(gateway_ws_url: &str) -> Option<String> {
    gateway_ws_url
        .split_once('?')
        .and_then(|(_, query)| extract_query_value(query, "token"))
}

/// 将浏览器发来的 connect 请求中的 auth.token 改写为桌面端持有的网关 token。
///
/// - `raw_text`: 浏览器发来的原始文本帧。
/// - `gateway_token`: 网关 token。
pub(super) fn rewrite_connect_request_auth_token(raw_text: &str, gateway_token: Option<&str>) -> String {
    let Some(token) = gateway_token else {
        return raw_text.to_string();
    };

    let Ok(mut payload) = serde_json::from_str::<Value>(raw_text) else {
        return raw_text.to_string();
    };

    let is_connect_request = payload
        .get("type")
        .and_then(Value::as_str)
        .map(|value| value == "req")
        .unwrap_or(false)
        && payload
            .get("method")
            .and_then(Value::as_str)
            .map(|value| value == "connect")
            .unwrap_or(false);

    if !is_connect_request {
        return raw_text.to_string();
    }

    if !matches!(payload.get("params"), Some(Value::Object(_))) {
        payload["params"] = json!({});
    }
    if !matches!(payload["params"].get("auth"), Some(Value::Object(_))) {
        payload["params"]["auth"] = json!({});
    }

    payload["params"]["auth"]["token"] = Value::String(token.to_string());
    serde_json::to_string(&payload).unwrap_or_else(|_| raw_text.to_string())
}

/// 构造网关连接候选地址列表。
///
/// 当目标为 localhost 时，自动补充 127.0.0.1 / [::1] 兜底。
///
/// - `gateway_ws_url`: 原始网关地址。
fn build_gateway_connect_candidates(gateway_ws_url: &str) -> Vec<String> {
    let mut candidates: Vec<String> = Vec::new();
    let without_query = gateway_ws_url
        .split('?')
        .next()
        .unwrap_or(gateway_ws_url)
        .to_string();
    let with_query = gateway_ws_url.to_string();

    let mut base_candidates: Vec<String> = Vec::new();
    // 优先尝试无 query 地址，避免部分网关在 HTTP Upgrade 阶段直接拒绝 ?token。
    // 仍保留带 query 兜底，兼容依赖 URL token 的部署。
    let ordered = [without_query, with_query];
    for candidate in ordered {
        if !base_candidates.iter().any(|item| item == &candidate) {
            base_candidates.push(candidate);
        }
    }

    for base in base_candidates {
        if !candidates.iter().any(|item| item == &base) {
            candidates.push(base.clone());
        }

        if let Some((protocol_part, host_and_path)) = base.split_once("://localhost") {
            let ipv4 = format!("{}://127.0.0.1{}", protocol_part, host_and_path);
            if !candidates.iter().any(|item| item == &ipv4) {
                candidates.push(ipv4);
            }

            let ipv6 = format!("{}://[::1]{}", protocol_part, host_and_path);
            if !candidates.iter().any(|item| item == &ipv6) {
                candidates.push(ipv6);
            }
        }
    }

    candidates
}

/// 向 Origin 候选列表追加去重项。
///
/// - `target`: 目标列表。
/// - `value`: 待追加值。
fn push_unique_origin_candidate(target: &mut Vec<Option<String>>, value: Option<String>) {
    if !target.iter().any(|item| item == &value) {
        target.push(value);
    }
}

/// 构造网关连接时的 Origin 候选列表。
///
/// - `gateway_ws_url`: 目标网关地址。
/// - `browser_origin`: 浏览器侧请求 Origin（可选）。
fn build_gateway_origin_candidates(
    gateway_ws_url: &str,
    browser_origin: Option<&str>,
) -> Vec<Option<String>> {
    let mut candidates: Vec<Option<String>> = Vec::new();

    let authority = gateway_ws_url
        .split("://")
        .nth(1)
        .and_then(|part| part.split('/').next())
        .and_then(|part| part.split('?').next())
        .unwrap_or("")
        .trim()
        .to_string();
    let authority_lower = authority.to_lowercase();
    let loopback_like = authority_lower == "localhost"
        || authority_lower.starts_with("localhost:")
        || authority_lower == "127.0.0.1"
        || authority_lower.starts_with("127.0.0.1:")
        || authority_lower == "[::1]"
        || authority_lower.starts_with("[::1]:");

    // 本地回环网关优先本机 Origin，避免手机/远程页面 Origin 先命中导致 connect 阶段被拒绝。
    if loopback_like {
        push_unique_origin_candidate(&mut candidates, Some("tauri://localhost".to_string()));
        push_unique_origin_candidate(&mut candidates, Some("http://tauri.localhost".to_string()));
        push_unique_origin_candidate(&mut candidates, Some("http://localhost".to_string()));
        push_unique_origin_candidate(&mut candidates, Some("http://127.0.0.1".to_string()));
    }

    // 网关自身 Origin（公网场景通常最容易命中 allowedOrigins）。
    if let Some((scheme, _)) = gateway_ws_url.split_once("://") {
        if !authority.is_empty() {
            if scheme.eq_ignore_ascii_case("wss") {
                push_unique_origin_candidate(&mut candidates, Some(format!("https://{}", authority)));
                push_unique_origin_candidate(&mut candidates, Some(format!("http://{}", authority)));
            } else {
                push_unique_origin_candidate(&mut candidates, Some(format!("http://{}", authority)));
                push_unique_origin_candidate(&mut candidates, Some(format!("https://{}", authority)));
            }
        }
    }

    // 浏览器真实 Origin 作为动态兜底候选。
    if let Some(origin) = browser_origin {
        let normalized = origin.trim();
        if !normalized.is_empty() {
            push_unique_origin_candidate(&mut candidates, Some(normalized.to_string()));
        }
    }

    if !loopback_like {
        push_unique_origin_candidate(&mut candidates, Some("http://tauri.localhost".to_string()));
        push_unique_origin_candidate(&mut candidates, Some("tauri://localhost".to_string()));
        push_unique_origin_candidate(&mut candidates, Some("http://localhost".to_string()));
        push_unique_origin_candidate(&mut candidates, Some("http://127.0.0.1".to_string()));
    }
    push_unique_origin_candidate(&mut candidates, Some("http://localhost:5173".to_string()));
    push_unique_origin_candidate(&mut candidates, None);

    candidates
}

/// 生成 Origin 文本，用于日志展示。
///
/// - `origin`: Origin 候选值。
fn origin_label(origin: Option<&str>) -> &str {
    origin.unwrap_or("NONE")
}

/// 根据连接错误生成可读提示。
///
/// - `raw_error`: 原始错误文本。
fn enhance_gateway_connect_error(raw_error: &str) -> String {
    if raw_error.contains("400 Bad Request") {
        return format!(
            "{}；可能是 Origin 被网关拒绝，请检查 gateway.controlUi.allowedOrigins 是否包含 tauri://localhost",
            raw_error
        );
    }
    raw_error.to_string()
}

/// 向浏览器发送代理错误事件并主动关闭连接。
///
/// - `client_socket`: 浏览器侧 WebSocket。
/// - `message`: 错误文本。
async fn emit_proxy_error(client_socket: &mut WebSocket, message: &str) {
    let payload = json!({
        "type": "event",
        "event": "proxy.error",
        "payload": {
            "message": message,
        },
    });
    let _ = client_socket.send(AxumWsMessage::Text(payload.to_string().into())).await;
    let _ = client_socket.send(AxumWsMessage::Close(None)).await;
}

/// 映射浏览器消息到网关消息。
///
/// - `message`: 浏览器侧消息。
/// - `gateway_token`: 桌面端持有的网关 token。
fn map_client_to_gateway_message(
    message: AxumWsMessage,
    gateway_token: Option<&str>,
) -> Option<TungsteniteMessage> {
    match message {
        AxumWsMessage::Text(text) => Some(TungsteniteMessage::Text(
            rewrite_connect_request_auth_token(&text, gateway_token),
        )),
        AxumWsMessage::Binary(data) => Some(TungsteniteMessage::Binary(data.to_vec())),
        AxumWsMessage::Ping(data) => Some(TungsteniteMessage::Ping(data.to_vec())),
        AxumWsMessage::Pong(data) => Some(TungsteniteMessage::Pong(data.to_vec())),
        AxumWsMessage::Close(_) => Some(TungsteniteMessage::Close(None)),
    }
}

/// 映射网关消息到浏览器消息。
///
/// - `message`: 网关侧消息。
fn map_gateway_to_client_message(message: TungsteniteMessage) -> Option<AxumWsMessage> {
    match message {
        TungsteniteMessage::Text(text) => Some(AxumWsMessage::Text(text.into())),
        TungsteniteMessage::Binary(data) => Some(AxumWsMessage::Binary(data.into())),
        TungsteniteMessage::Ping(data) => Some(AxumWsMessage::Ping(data.into())),
        TungsteniteMessage::Pong(data) => Some(AxumWsMessage::Pong(data.into())),
        TungsteniteMessage::Close(_) => Some(AxumWsMessage::Close(None)),
        _ => None,
    }
}

/// 执行 WebSocket 双向转发。
///
/// - `client_socket`: 浏览器侧 WebSocket 连接。
/// - `gateway_ws_url`: 目标网关地址。
/// - `browser_origin`: 浏览器侧请求 Origin（可选）。
async fn proxy_websocket_tunnel(
    mut client_socket: WebSocket,
    gateway_ws_url: String,
    browser_origin: Option<String>,
) {
    let connect_candidates = build_gateway_connect_candidates(&gateway_ws_url);
    let gateway_auth_token = extract_gateway_token(&gateway_ws_url);
    let mut last_error_text: Option<String> = None;
    let mut chosen_candidate: Option<String> = None;
    let mut connected_gateway_socket = None;

    for candidate in connect_candidates {
        let origin_candidates = build_gateway_origin_candidates(&candidate, browser_origin.as_deref());
        for origin in origin_candidates {
            let connect_result = match origin.as_deref() {
                Some(origin_value) => {
                    let request_build_result = candidate.as_str().into_client_request();
                    let mut request = match request_build_result {
                        Ok(request) => request,
                        Err(error) => {
                            let error_text = format!("构建网关请求失败: {}", error);
                            last_error_text = Some(error_text.clone());
                            log::warn!(
                                "连接网关候选失败: {} [Origin={}] -> {}",
                                candidate,
                                origin_label(Some(origin_value)),
                                error_text
                            );
                            continue;
                        }
                    };

                    let header_value = match HeaderValue::from_str(origin_value) {
                        Ok(value) => value,
                        Err(error) => {
                            let error_text = format!("Origin 头无效: {}", error);
                            last_error_text = Some(error_text.clone());
                            log::warn!(
                                "连接网关候选失败: {} [Origin={}] -> {}",
                                candidate,
                                origin_label(Some(origin_value)),
                                error_text
                            );
                            continue;
                        }
                    };
                    request.headers_mut().insert("origin", header_value);
                    connect_async(request).await
                }
                None => connect_async(candidate.as_str()).await,
            };

            match connect_result {
                Ok((socket, _)) => {
                    chosen_candidate = Some(candidate.clone());
                    connected_gateway_socket = Some(socket);
                    break;
                }
                Err(error) => {
                    let error_text = error.to_string();
                    let origin_text = origin_label(origin.as_deref());
                    log::warn!(
                        "连接网关候选失败: {} [Origin={}] -> {}",
                        candidate,
                        origin_text,
                        error_text
                    );
                    last_error_text = Some(error_text);
                }
            }
        }

        if connected_gateway_socket.is_some() {
            break;
        }
    }

    let gateway_socket = match connected_gateway_socket {
        Some(socket) => socket,
        None => {
            let raw_error_text = last_error_text.unwrap_or_else(|| "未知错误".to_string());
            let error_text = enhance_gateway_connect_error(&raw_error_text);
            let message = format!("代理连接网关失败: {}", error_text);
            log::error!("连接网关失败: {} -> {}", gateway_ws_url, message);
            emit_proxy_error(&mut client_socket, &message).await;
            return;
        }
    };

    if let Some(candidate) = chosen_candidate {
        log::info!("WebSocket 代理连接成功: {}", candidate);
    }

    let (mut client_tx, mut client_rx) = client_socket.split();
    let (mut gateway_tx, mut gateway_rx) = gateway_socket.split();

    let client_to_gateway = async {
        while let Some(next_message) = client_rx.next().await {
            let message = match next_message {
                Ok(message) => message,
                Err(error) => {
                    log::warn!("浏览器侧 WebSocket 读取失败: {}", error);
                    break;
                }
            };

            let mapped = match map_client_to_gateway_message(message, gateway_auth_token.as_deref()) {
                Some(value) => value,
                None => continue,
            };

            if let TungsteniteMessage::Text(text) = &mapped {
                if text.contains("\"method\":\"connect\"") {
                    log::info!("代理转发 connect 请求到网关");
                }
            }

            if gateway_tx.send(mapped).await.is_err() {
                break;
            }
        }

        let _ = gateway_tx.close().await;
    };

    let gateway_to_client = async {
        while let Some(next_message) = gateway_rx.next().await {
            let message = match next_message {
                Ok(message) => message,
                Err(error) => {
                    log::warn!("网关侧 WebSocket 读取失败: {}", error);
                    break;
                }
            };

            match &message {
                TungsteniteMessage::Text(text) => {
                    if text.contains("\"event\":\"connect.challenge\"") {
                        log::info!("网关返回 connect.challenge");
                    }
                    if text.contains("\"type\":\"res\"") && text.contains("\"ok\":false") {
                        log::warn!("网关返回握手失败响应: {}", text);
                    }
                }
                TungsteniteMessage::Close(frame) => {
                    let reason = frame
                        .as_ref()
                        .map(|value| value.reason.to_string())
                        .unwrap_or_default();
                    let code = frame
                        .as_ref()
                        .map(|value| value.code.to_string())
                        .unwrap_or_default();
                    log::warn!("网关主动关闭连接: code={} reason={}", code, reason);
                }
                _ => {}
            }

            let mapped = match map_gateway_to_client_message(message) {
                Some(value) => value,
                None => continue,
            };

            if client_tx.send(mapped).await.is_err() {
                break;
            }
        }

        let _ = client_tx.close().await;
    };

    tokio::select! {
        _ = client_to_gateway => {}
        _ = gateway_to_client => {}
    }
}

/// WebSocket 代理入口。
///
/// 将浏览器连接转发到当前配置的网关 ws 地址，避免浏览器直接访问内网端口失败。
///
/// - `state`: Web 服务共享状态。
/// - `ws`: Axum WebSocket 升级句柄。
pub(super) async fn ws_proxy_upgrade(
    State(state): State<Arc<WebServerState>>,
    headers: HeaderMap,
    ws: WebSocketUpgrade,
) -> Response {
    let gateway_ws_url = {
        let config = state.gateway_config.lock().await;
        config.ws_url.trim().to_string()
    };

    if gateway_ws_url.is_empty() {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            "网关地址未配置，无法建立 WebSocket 代理",
        )
            .into_response();
    }

    let browser_origin = headers
        .get("origin")
        .and_then(|value| value.to_str().ok())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    ws.on_upgrade(move |socket| async move {
        proxy_websocket_tunnel(socket, gateway_ws_url, browser_origin).await;
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rewrite_connect_request_auth_token_replaces_browser_token() {
        let raw = r#"{"type":"req","id":"1","method":"connect","params":{"auth":{"token":"browser-token"}}}"#;
        let rewritten = rewrite_connect_request_auth_token(raw, Some("gateway-secret"));

        assert!(rewritten.contains("gateway-secret"));
        assert!(!rewritten.contains("browser-token"));
    }
}
