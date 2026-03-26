# ClawWorkbench

[English](./README.md) | 中文文档

ClawWorkbench 是一个面向 OpenClaw Gateway v3 的桌面客户端。

它不只是一个聊天窗口，还提供多服务器接入、多 Agent / 多 Session 管理、配置编辑、日志 / Memory / Cron / 子代理面板，以及桌面端专属的通知、托盘和远程 Web 访问能力。

## 适合什么场景

- 连接本地或远程 OpenClaw Gateway，统一管理多个服务器
- 在同一个桌面应用里切换多个 Agent、多个会话
- 边聊天边观察 Gateway 状态、日志、记忆、Cron 任务与子代理运行情况
- 直接在客户端里维护 OpenClaw 配置，而不是手改配置文件
- 临时把当前桌面界面通过 Web 服务暴露到浏览器远程访问

## 当前可用能力

### 1. 聊天与会话

- 多服务器切换，支持 `ws` / `wss` 网关地址
- 多 Agent / 多 Session 管理
- 流式响应、Markdown 渲染、代码块展示
- 会话级模型切换与 `thinking level` 调整
- 斜杠命令面板，支持搜索、别名、参数占位插入
- 支持图片粘贴、拖拽上传与图片预览
- 支持导出单条助手消息或整段会话为 Markdown
- 支持展示工具调用过程与执行审批请求

### 2. Gateway 运维面板

- `Gateway 状态`：查看版本、协议、运行时长、在线设备
- `Memory`：搜索、分页浏览、清空记忆文件内容
- `Cron`：新增、编辑、删除、启停和手动运行任务，查看最近运行记录
- `Logs`：实时 tail 日志，支持级别筛选、搜索、表格/JSON 双视图
- `子代理`：查看子任务运行状态并可终止任务

### 3. 配置编辑器

- 支持表单视图与 JSON 视图切换
- 支持编辑：
  - 模型与 Provider
  - Agent 列表
  - Agent 默认配置
  - 日志配置
  - 绑定规则
  - Skills
- 连接 Gateway 时优先通过 RPC 读写配置
- RPC 不可用时可回退到本地文件模式
- 内置配置校验与冲突提示

### 4. 桌面端体验

- 单实例保护，重复启动会回到已有窗口
- 关闭主窗口默认隐藏到托盘，不直接退出
- 支持系统通知；Windows 下可触发任务栏闪烁提醒
- 可打开外部链接、导出文本文件、读取受限目录下的本地图片

### 5. Web 远程访问

- 桌面端可启动内嵌 Web 服务
- 可把当前前端界面通过浏览器远程访问
- 自动提供 `/api/config` 与 `/ws` 代理，浏览器无需直接连接本机网关端口
- 支持访问令牌，适合配合 Tailscale、FRP 等端口映射工具使用

## 首次使用

### 1. 准备 Gateway 地址

你需要先准备一个可访问的 OpenClaw Gateway 地址，例如：

```text
ws://localhost:18789?token=your-token
wss://gateway.example.com?token=your-token
```

### 2. 启动应用

如果你已经有打包好的桌面程序，直接打开即可。

如果你是从源码运行，请看后面的“本地开发与构建”章节。

### 3. 添加服务器

打开应用后，新增服务器有两种方式：

- 快速录入：直接粘贴完整地址，例如 `wss://host:port?token=xxx`
- 手动填写：名称、主机、端口、协议、Token

说明：

- 端口可以留空，使用协议默认端口
- 目前连接地址必须带 `token` 参数
- 所有服务器配置都通过界面管理，不需要手动设置环境变量

### 4. 开始聊天

基础流程：

1. 选择服务器
2. 选择 Agent
3. 选择已有 Session，或直接开始新会话
4. 输入消息并发送
5. 需要时输入 `/` 打开斜杠命令面板

常见可用交互：

- 输入 `/` 调出命令面板
- 粘贴或拖拽图片到输入区
- 在会话中切换模型或思考等级
- 导出单条消息或整段会话
- 在需要执行审批时，直接在界面中允许或拒绝

## 主要界面说明

### 服务器管理

- 维护多个 Gateway 连接入口
- 支持快速录入地址解析
- 适合同时管理本地环境、测试环境、生产环境

### 会话区

- 左侧用于 Agent / Session 切换
- 中间用于消息展示与输入
- 助手回复支持 Markdown 渲染
- 工具调用可以单独展开查看

### 配置编辑器

适合以下场景：

- 新增或调整模型 Provider
- 配置 Agent 默认模型、工作目录和技能
- 调整日志、绑定和 Skills
- 在表单视图与 JSON 视图之间切换编辑

### Gateway 状态

适合快速确认：

- 当前连接的 Gateway 是否正常
- 协议版本是否匹配
- 在线设备数量与基本信息

### Memory / Cron / Logs / 子代理

这些面板更偏运维和调试：

- `Memory`：查看和搜索 Gateway 侧记忆内容
- `Cron`：维护定时任务并查看运行记录
- `Logs`：查看运行日志，适合排查问题
- `子代理`：观察多任务拆分执行过程

## Web 远程访问怎么用

这个功能只在桌面端可用。

使用步骤：

1. 打开 `Web 远程服务` 面板
2. 设置监听端口
3. 可选设置访问令牌
4. 点击启动服务
5. 按需要把本机端口通过 Tailscale、FRP 等工具映射出去
6. 在远程浏览器中访问生成的完整地址

说明：

- 访问令牌可以留空，但更推荐开启
- 启动后如果当前服务器切换，Web 服务会自动同步到新的 Gateway 配置
- 如果提示找不到前端资源目录 `dist/`，先执行一次 `pnpm build`

## 桌面端行为说明

- 点击窗口关闭按钮时，程序默认隐藏到托盘
- 如果想真正退出，请使用托盘菜单中的退出项
- 当窗口失焦且收到新助手消息时，应用会尝试发送系统通知
- Windows 下会额外闪烁任务栏图标提示

## 常用斜杠命令示例

```text
/help
/status
/context detail
/think high
/model gpt-4
/reset
/export-session
/subagents list
```

实际可用命令以应用内命令面板为准。

## 常见问题

### 1. 为什么连接不上 Gateway？

请优先检查：

- 地址是否是 `ws://` 或 `wss://`
- 主机和端口是否正确
- `token` 是否有效
- Gateway 是否已经启动
- 当前 Gateway 协议能力是否与客户端匹配

### 2. 为什么有些面板没有数据？

部分功能依赖 Gateway 提供对应 RPC 或事件能力，例如：

- `logs.tail`
- Memory 相关接口
- Cron 相关接口
- 子代理相关事件

如果你的 Gateway 版本较旧，某些面板可能只能显示为空或不可用。

### 3. 为什么点关闭窗口没有退出？

这是当前桌面端的默认行为：关闭窗口会隐藏到托盘，避免误退出。

### 4. 为什么 Web 远程服务启动失败？

常见原因：

- 端口被占用
- 当前不是桌面端运行
- 还没有构建 `dist/` 资源，请先执行 `pnpm build`

## 本地开发与构建

如果你需要从源码运行：

### 环境要求

- Node.js >= 18
- pnpm >= 8
- Rust >= 1.77.2

### 安装依赖

```bash
pnpm install
```

### 开发模式

```bash
pnpm dev
pnpm tauri dev
```

说明：

- `pnpm dev` 只启动前端开发服务器
- `pnpm tauri dev` 会启动完整桌面开发模式

### 构建

```bash
pnpm lint
pnpm build
pnpm tauri build
```

说明：

- 项目默认手工构建、手工测试、手工发布
- 当前不依赖 CI/CD 自动发布流程

### 版本管理

当前版本管理统一按“手工同步、手工发布”处理，`无迁移，直接替换`。

```bash
pnpm version:check
pnpm version:set -- 0.2.0
```

说明：

- `package.json` 作为仓库主版本入口
- `src-tauri/tauri.conf.json` 与 `src-tauri/Cargo.toml` 通过脚本手工同步
- 前端握手版本在构建时自动读取 `package.json`，不再单独硬编码
- 完成同步后，再人工执行构建、验证、提交和打标签

## 项目结构

```text
src/                 前端 React + TypeScript 代码
src/components/      聊天、配置、日志、Memory、Cron 等 UI 组件
src/hooks/           Gateway 通信、配置、服务器、通知等状态逻辑
src/data/            斜杠命令与主题数据
src/types/           前端领域类型定义
src-tauri/           Tauri Rust 入口与内嵌 Web 服务实现
```

## 参考资料

- [OpenClaw 官方文档](https://docs.openclaw.ai/)
- [Gateway Protocol 文档](https://docs.openclaw.ai/gateway/protocol)
- [OpenClaw Studio 架构说明](https://github.com/grp06/openclaw-studio/blob/main/ARCHITECTURE.md)
- [OpenClaw 协议 Schema](https://github.com/openclaw/openclaw/tree/main/src/gateway/protocol/schema)

---

最后更新：2026-03-09
