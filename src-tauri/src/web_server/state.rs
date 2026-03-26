//! Web 服务共享状态类型定义
//!
//! @author towfive

use serde::Serialize;
use tokio::sync::{Mutex, oneshot};

/// Web 服务运行信息
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct WebServerInfo {
    /// 是否正在运行
    pub running: bool,
    /// 监听端口
    pub port: u16,
    /// 访问令牌（为 None 时跳过鉴权）
    pub access_token: Option<String>,
    /// 启动时间戳（Unix 毫秒）
    pub started_at: Option<u64>,
}

impl Default for WebServerInfo {
    fn default() -> Self {
        Self {
            running: false,
            port: 0,
            access_token: None,
            started_at: None,
        }
    }
}

/// 网关配置，透传给远程前端
#[derive(Serialize, Clone, Debug, Default)]
pub struct GatewayConfig {
    /// WebSocket 网关地址
    pub ws_url: String,
    /// 服务器名称
    pub server_name: String,
}

/// Web 服务共享状态，通过 Tauri managed state 注入
pub struct WebServerState {
    /// 服务运行信息
    pub info: Mutex<WebServerInfo>,
    /// 优雅关闭信号发送端
    pub shutdown_tx: Mutex<Option<oneshot::Sender<()>>>,
    /// 网关配置
    pub gateway_config: Mutex<GatewayConfig>,
}

impl Default for WebServerState {
    fn default() -> Self {
        Self {
            info: Mutex::new(WebServerInfo::default()),
            shutdown_tx: Mutex::new(None),
            gateway_config: Mutex::new(GatewayConfig::default()),
        }
    }
}
