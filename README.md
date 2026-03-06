# Slack Max API MCP

Slack Web API MCP server for Codex/Claude Code over `stdio`.

- Package: `slack-max-api-mcp`
- Runtime: pure CLI MCP over stdio
- HTTP Slack API gateway/proxy: removed
- Local HTTP callback is still used only for OAuth code return

## Tool exposure

- `smart` (default): 16 tools (`gateway_*` router names + core tools)
- `legacy`: fixed core tools + optional catalog method tools

Environment:

- `SLACK_TOOL_EXPOSURE_MODE=smart|legacy`
- `SLACK_SMART_COMPAT_CORE_TOOLS=true|false`
- `SLACK_ENABLE_METHOD_TOOLS=true|false`
- `SLACK_MAX_METHOD_TOOLS=<number>`

## Install

```powershell
npm install -g slack-max-api-mcp@latest
```

## Register MCP

Codex:

```powershell
codex mcp add slack-max -- npx -y slack-max-api-mcp
codex mcp list
```

Claude Code:

```powershell
claude mcp add slack-max -- npx -y slack-max-api-mcp
claude mcp list
```

## Auth options

### 1) Local OAuth (single machine)

```powershell
setx SLACK_CLIENT_ID "YOUR_CLIENT_ID"
setx SLACK_CLIENT_SECRET "YOUR_CLIENT_SECRET"
npx -y slack-max-api-mcp oauth login --profile my-workspace --team T1234567890
```

Helper commands:

```powershell
npx -y slack-max-api-mcp oauth list
npx -y slack-max-api-mcp oauth use <profile_key_or_name>
npx -y slack-max-api-mcp oauth current
```

### 2) Central onboarding server (team onboarding, no client secret on team PCs)

Run on central server:

```powershell
setx SLACK_CLIENT_ID "YOUR_CLIENT_ID"
setx SLACK_CLIENT_SECRET "YOUR_CLIENT_SECRET"
setx SLACK_ONBOARD_SERVER_HOST "0.0.0.0"
setx SLACK_ONBOARD_SERVER_PORT "8790"
setx SLACK_ONBOARD_PUBLIC_BASE_URL "https://onboard.example.com"
npx -y slack-max-api-mcp onboard-server start
```

Run on team member PC:

```powershell
npx -y slack-max-api-mcp onboard run
```

This flow opens browser OAuth via central server and saves tokens to local token store.
Default onboard server URL is `https://43.202.54.65.sslip.io`.
Use `--server` (or `SLACK_ONBOARD_SERVER_URL`) only when overriding it.

### 3) Manual token mode

```powershell
setx SLACK_BOT_TOKEN "xoxb-..."
setx SLACK_USER_TOKEN "xoxp-..."
```

## Token precedence

1. `token_override` in tool input
2. env tokens: `SLACK_BOT_TOKEN` / `SLACK_USER_TOKEN` / `SLACK_TOKEN`
3. active OAuth profile from token store (`SLACK_PROFILE` or default profile)
4. `.env.example` fallback if `SLACK_ALLOW_ENV_EXAMPLE_FALLBACK=true`

## Development

```powershell
npm install
npm run check
npm run build:catalog
npm run start
node src/slack-mcp-server.js help
```
