# ClawWorkbench

English | [中文文档](./README.zh-CN.md)

ClawWorkbench is a desktop client for OpenClaw Gateway v3.

It is more than a chat window. It also provides multi-server access, multi-Agent / multi-Session management, config editing, Logs / Memory / Cron / Subagent panels, plus desktop-only notifications, tray support, and remote Web access.

## Best For

- Connecting to local or remote OpenClaw Gateways and managing multiple servers in one place
- Switching between multiple Agents and Sessions inside the same desktop app
- Watching Gateway status, logs, memory, cron jobs, and subagent activity while chatting
- Editing OpenClaw config directly in the client instead of manually changing files
- Temporarily exposing the current desktop UI through a Web service for remote browser access

## Available Features

### 1. Chat and Sessions

- Multi-server switching with `ws` / `wss` Gateway addresses
- Multi-Agent / multi-Session management
- Streaming responses, Markdown rendering, and code block display
- Session-level model switching and `thinking level` control
- Slash command panel with search, aliases, and parameter placeholders
- Image paste, drag-and-drop upload, and preview support
- Export a single assistant message or a full session as Markdown
- Tool call visualization and execution approval handling

### 2. Gateway Ops Panels

- `Gateway Status`: version, protocol, uptime, and online devices
- `Memory`: search, pagination, and clear memory file content
- `Cron`: create, edit, delete, enable/disable, run jobs manually, and inspect recent runs
- `Logs`: real-time tailing, level filtering, search, and table / JSON views
- `Subagent`: inspect task state and abort running tasks

### 3. Config Editor

- Switch between form view and JSON view
- Edit:
  - Models and Providers
  - Agent list
  - Agent defaults
  - Logging config
  - Binding rules
  - Skills
- Prefer RPC-based config read/write when connected to Gateway
- Fall back to local file mode when RPC is unavailable
- Built-in validation and conflict hints

### 4. Desktop Experience

- Single-instance protection that focuses the existing window on relaunch
- Closing the main window hides it to the tray instead of quitting
- System notifications; on Windows, taskbar flashing can also be triggered
- Open external links, export text files, and read local images from restricted directories

### 5. Remote Web Access

- Start an embedded Web server from the desktop client
- Access the current frontend UI remotely from a browser
- Automatically expose `/api/config` and `/ws` proxy endpoints so the browser does not need to connect to the local Gateway port directly
- Optional access token support, suitable for Tailscale, FRP, or similar port forwarding tools

## First Run

### 1. Prepare a Gateway Address

You need a reachable OpenClaw Gateway address first, for example:

```text
ws://localhost:18789?token=your-token
wss://gateway.example.com?token=your-token
```

### 2. Start the App

If you already have a packaged desktop build, just open it.

If you are running from source, see the “Local Development and Build” section below.

### 3. Add a Server

After opening the app, you can add a server in two ways:

- Quick input: paste the full address, for example `wss://host:port?token=xxx`
- Manual input: name, host, port, protocol, and token

Notes:

- The port can be left empty to use the protocol default
- The current connection URL must include a `token` parameter
- All server config is managed in the UI; no manual environment variables are required

### 4. Start Chatting

Basic flow:

1. Select a server
2. Select an Agent
3. Select an existing Session or start a new one
4. Type and send a message
5. Enter `/` when you need the slash command panel

Common interactions:

- Enter `/` to open the command panel
- Paste or drag images into the input area
- Switch model or thinking level for the current session
- Export a single message or a full session
- Approve or reject execution requests directly in the UI

## Main Areas

### Server Management

- Maintain multiple Gateway connections
- Supports quick address parsing
- Useful for managing local, test, and production environments together

### Session Area

- Left side for Agent / Session switching
- Center area for messages and input
- Assistant replies support Markdown rendering
- Tool calls can be expanded independently

### Config Editor

Useful for:

- Adding or adjusting model providers
- Setting default models, workspaces, and skills for Agents
- Editing logging, bindings, and skills
- Switching between form and JSON views

### Gateway Status

Useful for quickly checking:

- Whether the connected Gateway is healthy
- Whether the protocol version matches
- Online device count and basic information

### Memory / Cron / Logs / Subagent

These panels are more operations- and debugging-focused:

- `Memory`: inspect and search Gateway-side memory content
- `Cron`: manage scheduled jobs and inspect run records
- `Logs`: inspect runtime logs for troubleshooting
- `Subagent`: observe multi-task decomposition and execution

## How to Use Remote Web Access

This feature is available only in desktop mode.

Steps:

1. Open the `Web Remote Service` panel
2. Set the listening port
3. Optionally set an access token
4. Start the service
5. Expose the local port with Tailscale, FRP, or similar tools if needed
6. Open the generated full URL in a remote browser

Notes:

- The access token can be empty, but enabling it is recommended
- If the current server changes after startup, the Web service automatically syncs to the new Gateway config
- If the app cannot find the frontend asset directory `dist/`, run `pnpm build` first

## Desktop Behavior

- Clicking the window close button hides the app to the tray
- To exit completely, use the tray menu exit action
- When the window is unfocused and a new assistant message arrives, the app tries to send a system notification
- On Windows, the taskbar icon may also flash

## Common Slash Command Examples

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

The actual available commands are defined by the in-app command panel.

## FAQ

### 1. Why can’t I connect to the Gateway?

Please check first:

- Whether the address uses `ws://` or `wss://`
- Whether the host and port are correct
- Whether the `token` is valid
- Whether the Gateway is already running
- Whether the Gateway protocol capability matches the client

### 2. Why do some panels have no data?

Some features depend on Gateway RPC methods or events, for example:

- `logs.tail`
- Memory-related APIs
- Cron-related APIs
- Subagent-related events

If your Gateway version is older, some panels may appear empty or unavailable.

### 3. Why does closing the window not exit the app?

That is the current default desktop behavior: closing the window hides it to the tray to avoid accidental exits.

### 4. Why did the Remote Web Service fail to start?

Common reasons:

- The port is already in use
- The app is not running in desktop mode
- `dist/` has not been built yet; run `pnpm build` first

## Local Development and Build

If you want to run from source:

### Environment Requirements

- Node.js >= 18
- pnpm >= 8
- Rust >= 1.77.2

### Install Dependencies

```bash
pnpm install
```

### Development Mode

```bash
pnpm dev
pnpm tauri dev
```

Notes:

- `pnpm dev` starts only the frontend dev server
- `pnpm tauri dev` starts the full desktop development mode

### Build

```bash
pnpm lint
pnpm build
pnpm tauri build
```

Notes:

- This project uses manual build, manual test, and manual release flow by default
- CI/CD auto-release flow is intentionally disabled

### Version Management

Current version management follows a manual sync and manual release process: `No migration, replace directly`.

```bash
pnpm version:check
pnpm version:set -- 0.2.0
```

Notes:

- `package.json` is the primary version entry in this repository
- `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml` are synchronized manually through scripts
- Frontend handshake version is read from `package.json` during build instead of hard-coding it separately
- After syncing versions, perform build, verification, commit, and tagging manually

## Project Structure

```text
src/                 frontend React + TypeScript source
src/components/      chat, config, logs, memory, cron, and other UI components
src/hooks/           Gateway communication, config, servers, notifications, and other state logic
src/data/            slash commands and theme data
src/types/           frontend domain type definitions
src-tauri/           Tauri Rust entry and embedded Web service implementation
```

## References

- [OpenClaw Official Docs](https://docs.openclaw.ai/)
- [Gateway Protocol Docs](https://docs.openclaw.ai/gateway/protocol)
- [OpenClaw Studio Architecture](https://github.com/grp06/openclaw-studio/blob/main/ARCHITECTURE.md)
- [OpenClaw Protocol Schema](https://github.com/openclaw/openclaw/tree/main/src/gateway/protocol/schema)

---
