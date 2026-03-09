# Slack Max API MCP

Operations-first Slack MCP server for Codex/Claude Code over `stdio`.

- Package: `slack-max-api-mcp`
- Runtime: pure CLI MCP over stdio
- HTTP Slack API gateway/proxy: removed
- Local HTTP callback is still used only for OAuth code return

## Tool exposure

- `operations` (default): 21 operations-first tools only
- `developer`: operations tools + `gateway_*` + core Slack API tools
- `legacy`: fixed core tools + optional catalog method tools (final count depends on method-tool settings)

Environment:

- `SLACK_TOOL_EXPOSURE_MODE=operations|developer|legacy`
- `SLACK_SMART_COMPAT_CORE_TOOLS=true|false`
- `SLACK_ENABLE_METHOD_TOOLS=true|false`
- `SLACK_MAX_METHOD_TOOLS=<number>`

`smart` is still accepted as an alias for `developer`.

## Operations-first tools

The default surface is now operations-first and keeps raw API wrappers out of the main tool list:

- `ops_policy_info`: runtime policy/audit guardrails
- `ops_access_policy_info`: active access profile, effective rules, pending requests, active grants
- `ops_access_policy_set`: switch active access-control profile (`open`, `readonly`, `restricted`)
- `ops_access_request`: create a scoped elevation request for read/write/admin/delete access
- `ops_access_approve`: approve a pending elevation request and activate a time-boxed grant
- `ops_access_revoke`: revoke one grant or all active grants
- `ops_playbook_list`: built-in operations playbooks
- `ops_state_overview`: inspect local operations state (`incidents`, `digests`, `broadcasts`, `followups`)
- `ops_incident_create`: create + optionally announce a tracked incident
- `ops_incident_update`: persist a status change and optionally post a thread update
- `ops_incident_close`: close a tracked incident with stored resolution
- `ops_broadcast_prepare`: prepare and store a broadcast draft before sending
- `ops_playbook_run`: run standardized workflows (`incident_open`, `support_digest`, `release_broadcast`)
- `ops_channel_snapshot`: activity/participant/thread snapshot for a channel
- `ops_unanswered_threads`: find stale or unanswered question-like threads
- `ops_sla_breach_scan`: detect SLA breach threads across multiple channels
- `ops_sla_followup`: auto follow-up replies for SLA breaches with duplicate-suppression state
- `ops_broadcast_message`: send a prepared draft or direct operational announcement
- `ops_recent_failures`: list recent human-readable failures from local diagnostics state
- `ops_explain_error`: explain one recorded failure with troubleshooting hints
- `ops_audit_log_read`: inspect local JSONL audit logs

These tools let teams run repeatable Slack operations without rebuilding multi-step API call chains, and they persist local operational state to make incidents/broadcasts/followups first-class records.

## Config and state

- Operations config file: `config/operations.json`
- Override path: `SLACK_OPERATIONS_CONFIG_PATH=<path>`
- Local state path: `~/.slack-max-api-mcp/operations-state.json`
- Override path: `SLACK_OPERATIONS_STATE_PATH=<path>`

The operations config controls incident templates, digest defaults, broadcast templates, and follow-up suppression windows.

### Access control and diagnostics

- Access control is enforced inside the MCP server, not only by prompt instructions.
- Default profiles are `open`, `readonly`, and `restricted`.
- Elevation is two-step: create a scoped request with `ops_access_request`, then explicitly approve it with `ops_access_approve`.
- Recorded failures are stored in operations state and can be inspected with `ops_recent_failures` and `ops_explain_error`.

### Playbook examples

```text
Codex, run ops_playbook_run with playbook=incident_open on #incident-war-room.
title is "DB Latency Spike", severity is "sev2", owner is "@oncall-db", dry_run=true.
```

```text
Codex, run ops_playbook_run with playbook=support_digest for channels #support-kor and #support-global.
lookback_hours=24, sla_minutes=60, report_channel=#support-ops, dry_run=true.
```

```text
Codex, run ops_sla_followup for channels #support-kor and #support-global.
sla_minutes=90, lookback_hours=24, max_messages=20, dry_run=true.
```

```text
Codex, run ops_incident_create on #incident-war-room.
title is "API Error Spike", summary is "5xx rate above threshold", owner is "@oncall-api", dry_run=true.
```

```text
Codex, run ops_state_overview with collection=incidents and limit=10.
```

## Governance settings

- `SLACK_ENABLE_AUDIT_LOG=true|false` (default: `true`)
- `SLACK_AUDIT_LOG_PATH=<path>` (default: `~/.slack-max-api-mcp/audit.log`)
- `SLACK_METHOD_ALLOWLIST=chat.postMessage,conversations.history`
- `SLACK_METHOD_DENYLIST=users.deletePhoto`
- `SLACK_METHOD_ALLOW_PREFIXES=chat.,conversations.`
- `SLACK_METHOD_DENY_PREFIXES=admin.`

If allowlist/allow-prefix is set, methods outside that policy are blocked.

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
