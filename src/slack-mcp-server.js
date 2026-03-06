#!/usr/bin/env node

const fs = require("node:fs");
const os = require("node:os");
const http = require("node:http");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { z } = require("zod");

const SERVER_NAME = "slack-max-api-mcp";
const SERVER_VERSION = "2.0.0";

const SLACK_API_BASE_URL = process.env.SLACK_API_BASE_URL || "https://slack.com/api";

const CATALOG_PATH =
  process.env.SLACK_CATALOG_PATH || path.join(process.cwd(), "data", "slack-catalog.json");
const METHOD_TOOL_PREFIX = process.env.SLACK_METHOD_TOOL_PREFIX || "slack_method";
const TOOL_EXPOSURE_MODE = normalizeToolExposureMode(process.env.SLACK_TOOL_EXPOSURE_MODE);
const ENABLE_METHOD_TOOLS = parseBooleanEnv(
  process.env.SLACK_ENABLE_METHOD_TOOLS,
  TOOL_EXPOSURE_MODE === "legacy"
);
const MAX_METHOD_TOOLS = parseNumberEnv(
  process.env.SLACK_MAX_METHOD_TOOLS,
  TOOL_EXPOSURE_MODE === "legacy" ? 0 : 50
);
const SMART_COMPAT_CORE_TOOLS = parseBooleanEnv(
  process.env.SLACK_SMART_COMPAT_CORE_TOOLS,
  true
);
const ENV_EXAMPLE_PATH = path.join(process.cwd(), ".env.example");
const TOKEN_STORE_PATH =
  process.env.SLACK_TOKEN_STORE_PATH ||
  path.join(os.homedir(), ".slack-max-api-mcp", "tokens.json");
const ALLOW_ENV_EXAMPLE_FALLBACK = process.env.SLACK_ALLOW_ENV_EXAMPLE_FALLBACK === "true";
const OAUTH_CALLBACK_HOST = process.env.SLACK_OAUTH_CALLBACK_HOST || "127.0.0.1";
const OAUTH_CALLBACK_PORT = Number(process.env.SLACK_OAUTH_CALLBACK_PORT || 8787);
const OAUTH_CALLBACK_PATH = process.env.SLACK_OAUTH_CALLBACK_PATH || "/slack/oauth/callback";
const OAUTH_TIMEOUT_MS = Number(process.env.SLACK_OAUTH_TIMEOUT_MS || 5 * 60 * 1000);
const DEFAULT_OAUTH_BOT_SCOPES =
  process.env.SLACK_OAUTH_BOT_SCOPES || "chat:write,channels:read,groups:read,users:read";
const DEFAULT_OAUTH_USER_SCOPES =
  process.env.SLACK_OAUTH_USER_SCOPES ||
  "search:read,channels:read,groups:read,channels:history,groups:history";
const RETRYABLE_TOKEN_ERRORS = new Set(["not_allowed_token_type", "missing_scope"]);
const DEFAULT_ONBOARD_SERVER_URL = "https://43.202.54.65.sslip.io";
const ONBOARD_SERVER_URL = process.env.SLACK_ONBOARD_SERVER_URL || DEFAULT_ONBOARD_SERVER_URL;
const ONBOARD_SERVER_HOST = process.env.SLACK_ONBOARD_SERVER_HOST || "127.0.0.1";
const ONBOARD_SERVER_PORT = Number(process.env.SLACK_ONBOARD_SERVER_PORT || 8790);
const ONBOARD_PUBLIC_BASE_URL =
  process.env.SLACK_ONBOARD_PUBLIC_BASE_URL || `http://${ONBOARD_SERVER_HOST}:${ONBOARD_SERVER_PORT}`;
const ONBOARD_CALLBACK_PATH = process.env.SLACK_ONBOARD_SERVER_CALLBACK_PATH || OAUTH_CALLBACK_PATH;
const ONBOARD_CLAIM_TTL_MS = Number(process.env.SLACK_ONBOARD_CLAIM_TTL_MS || 10 * 60 * 1000);
const ONBOARD_POLL_INTERVAL_MS = Number(process.env.SLACK_ONBOARD_POLL_INTERVAL_MS || 2000);
const ONBOARD_TIMEOUT_MS = Number(process.env.SLACK_ONBOARD_TIMEOUT_MS || 5 * 60 * 1000);
function parseBooleanEnv(rawValue, defaultValue) {
  if (rawValue === undefined || rawValue === null || rawValue === "") return defaultValue;
  const normalized = String(rawValue).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return defaultValue;
}

function parseNumberEnv(rawValue, defaultValue) {
  if (rawValue === undefined || rawValue === null || rawValue === "") return defaultValue;
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) return defaultValue;
  return parsed;
}

function normalizeToolExposureMode(rawValue) {
  const normalized = String(rawValue || "smart").trim().toLowerCase();
  if (normalized === "legacy") return "legacy";
  return "smart";
}

function parseSimpleEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};

  const out = {};
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex <= 0) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (!key) continue;
    out[key] = value;
  }
  return out;
}

const ENV_EXAMPLE_VALUES = parseSimpleEnvFile(ENV_EXAMPLE_PATH);
const FIXED_BOT_TOKEN = ENV_EXAMPLE_VALUES.SLACK_BOT_TOKEN || "";
const FIXED_USER_TOKEN = ENV_EXAMPLE_VALUES.SLACK_USER_TOKEN || "";
const FIXED_GENERIC_TOKEN = ENV_EXAMPLE_VALUES.SLACK_TOKEN || "";

function parseScopeList(raw) {
  if (!raw) return [];
  return [...new Set(String(raw).split(",").map((part) => part.trim()).filter(Boolean))];
}

function ensureParentDirectory(filePath) {
  const dirPath = path.dirname(filePath);
  fs.mkdirSync(dirPath, { recursive: true });
}

function emptyTokenStore() {
  return { version: 1, default_profile: null, profiles: {} };
}

function normalizeTokenStore(value) {
  if (!value || typeof value !== "object") return emptyTokenStore();
  const out = { ...emptyTokenStore(), ...value };
  if (!out.profiles || typeof out.profiles !== "object" || Array.isArray(out.profiles)) {
    out.profiles = {};
  }
  return out;
}

function loadTokenStore() {
  if (!fs.existsSync(TOKEN_STORE_PATH)) return emptyTokenStore();

  try {
    const parsed = JSON.parse(fs.readFileSync(TOKEN_STORE_PATH, "utf8"));
    return normalizeTokenStore(parsed);
  } catch {
    return emptyTokenStore();
  }
}

function saveTokenStore(store) {
  ensureParentDirectory(TOKEN_STORE_PATH);
  fs.writeFileSync(TOKEN_STORE_PATH, JSON.stringify(normalizeTokenStore(store), null, 2), "utf8");
}

function resolveTokenStoreProfileBySelector(store, selector) {
  const profiles = store?.profiles || {};
  const keys = Object.keys(profiles);
  if (keys.length === 0) return null;

  const selected = selector || store.default_profile || keys[0];
  if (selected && profiles[selected]) {
    return { key: selected, profile: profiles[selected] };
  }

  const byName = keys.find((key) => profiles[key]?.profile_name === selected);
  if (byName) return { key: byName, profile: profiles[byName] };

  const byTeamId = keys.filter((key) => profiles[key]?.team_id === selected);
  if (byTeamId.length === 1) {
    const key = byTeamId[0];
    return { key, profile: profiles[key] };
  }

  return null;
}

function getPreferredTokenKinds(preferredTokenType) {
  const preferred = (preferredTokenType || process.env.SLACK_DEFAULT_TOKEN_TYPE || "bot").toLowerCase();
  if (preferred === "user") return ["user", "bot", "generic"];
  if (preferred === "generic") return ["generic", "bot", "user"];
  if (preferred === "auto") return ["user", "bot", "generic"];
  return ["bot", "user", "generic"];
}

function appendCandidateTokens(candidates, source, tokenMap, preferredKinds, seen) {
  for (const kind of preferredKinds) {
    const token = tokenMap[kind];
    if (!token || seen.has(token)) continue;
    seen.add(token);
    candidates.push({ token, source, kind });
  }
}

function getSlackTokenCandidates(tokenOverride, options = {}) {
  if (tokenOverride) {
    return [{ token: tokenOverride, source: "token_override", kind: "override" }];
  }

  const preferredKinds = getPreferredTokenKinds(options.preferredTokenType);
  const candidates = [];
  const seen = new Set();

  if (options.includeEnvTokens !== false) {
    appendCandidateTokens(
      candidates,
      "env",
      {
        bot: process.env.SLACK_BOT_TOKEN || "",
        user: process.env.SLACK_USER_TOKEN || "",
        generic: process.env.SLACK_TOKEN || "",
      },
      preferredKinds,
      seen
    );
  }

  if (options.includeTokenStore !== false) {
    const tokenStore = loadTokenStore();
    const activeProfile = resolveTokenStoreProfileBySelector(
      tokenStore,
      options.profileSelector || process.env.SLACK_PROFILE
    );
    if (activeProfile) {
      appendCandidateTokens(
        candidates,
        `token_store:${activeProfile.key}`,
        {
          bot: activeProfile.profile?.bot_token || "",
          user: activeProfile.profile?.user_token || "",
          generic: "",
        },
        preferredKinds,
        seen
      );
    }
  }

  if (ALLOW_ENV_EXAMPLE_FALLBACK) {
    appendCandidateTokens(
      candidates,
      "env_example",
      {
        bot: FIXED_BOT_TOKEN,
        user: FIXED_USER_TOKEN,
        generic: FIXED_GENERIC_TOKEN,
      },
      preferredKinds,
      seen
    );
  }

  return candidates;
}

function requireSlackTokenCandidate(tokenOverride, options = {}) {
  const candidates = getSlackTokenCandidates(tokenOverride, options);
  if (candidates.length === 0) {
    throw new Error(
      "Slack token is missing. Set SLACK_BOT_TOKEN/SLACK_USER_TOKEN/SLACK_TOKEN or run `slack-max-api-mcp oauth login`."
    );
  }
  return candidates[0];
}

function toUrlEncodedBody(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;

    if (Array.isArray(value) || (typeof value === "object" && !(value instanceof Date))) {
      search.append(key, JSON.stringify(value));
      continue;
    }

    search.append(key, String(value));
  }
  return search.toString();
}

function parseJsonMaybe(value) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function toRecordObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

async function callSlackApiWithToken(method, params = {}, token, tokenSource) {
  const url = `${SLACK_API_BASE_URL.replace(/\/+$/, "")}/${method}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
    },
    body: toUrlEncodedBody(params),
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Slack API returned non-JSON for ${method} (HTTP ${response.status}).`);
  }

  if (!response.ok) {
    const error = new Error(
      `Slack API HTTP ${response.status} for ${method}: ${data.error || "unknown_error"}`
    );
    error.http_status = response.status;
    error.slack_error = data.error || "unknown_error";
    error.needed = data.needed;
    error.provided = data.provided;
    error.token_source = tokenSource;
    throw error;
  }

  if (!data.ok) {
    const extraParts = [];
    if (data.needed) extraParts.push(`needed=${data.needed}`);
    if (data.provided) extraParts.push(`provided=${data.provided}`);
    if (tokenSource) extraParts.push(`token_source=${tokenSource}`);

    const extra = extraParts.length ? ` (${extraParts.join(", ")})` : "";
    const error = new Error(`Slack method ${method} failed: ${data.error || "unknown_error"}${extra}`);
    error.slack_error = data.error || "unknown_error";
    error.needed = data.needed;
    error.provided = data.provided;
    error.token_source = tokenSource;
    throw error;
  }

  return data;
}

async function callSlackApiWithCandidates(method, params, candidates) {
  let lastError = null;

  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = candidates[i];
    try {
      return await callSlackApiWithToken(method, params, candidate.token, candidate.source);
    } catch (error) {
      lastError = error;
      const canRetry = i < candidates.length - 1 && RETRYABLE_TOKEN_ERRORS.has(error.slack_error);
      if (!canRetry) {
        throw error;
      }
    }
  }

  throw lastError || new Error(`Slack method ${method} failed.`);
}

async function callSlackApi(method, params = {}, tokenOverride, options = {}) {
  const candidates = getSlackTokenCandidates(tokenOverride, options);
  if (candidates.length === 0) {
    throw new Error(
      "Slack token is missing. Set SLACK_BOT_TOKEN/SLACK_USER_TOKEN/SLACK_TOKEN or run slack-max-api-mcp oauth login."
    );
  }

  return callSlackApiWithCandidates(method, params, candidates);
}

function successResult(payload) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
  };
}

function errorResult(error) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    isError: true,
    content: [{ type: "text", text: message }],
  };
}

async function safeToolRun(executor) {
  try {
    const result = await executor();
    return successResult(result);
  } catch (error) {
    return errorResult(error);
  }
}

function parseCliArgs(argv) {
  const options = {};
  const positionals = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }

    const withoutPrefix = arg.slice(2);
    const [rawKey, rawInlineValue] = withoutPrefix.split("=", 2);
    const key = rawKey.trim();
    if (!key) continue;

    if (rawInlineValue !== undefined) {
      options[key] = rawInlineValue;
      continue;
    }

    const maybeValue = argv[i + 1];
    if (maybeValue && !maybeValue.startsWith("--")) {
      options[key] = maybeValue;
      i += 1;
      continue;
    }

    options[key] = true;
  }

  return { options, positionals };
}

function printOauthHelp() {
  const lines = [
    "Slack Max OAuth helper",
    "",
    "Usage:",
    "  slack-max-api-mcp oauth login [--profile NAME] [--team T123] [--scope a,b] [--user-scope c,d]",
    "  slack-max-api-mcp oauth list",
    "  slack-max-api-mcp oauth use <profile_key_or_name>",
    "  slack-max-api-mcp oauth current",
    "",
    "Required env vars for login:",
    "  SLACK_CLIENT_ID",
    "  SLACK_CLIENT_SECRET",
    "",
    "Optional env vars:",
    "  SLACK_OAUTH_BOT_SCOPES, SLACK_OAUTH_USER_SCOPES",
    "  SLACK_OAUTH_CALLBACK_HOST, SLACK_OAUTH_CALLBACK_PORT, SLACK_OAUTH_CALLBACK_PATH",
    "  SLACK_PROFILE, SLACK_TOKEN_STORE_PATH",
  ];
  console.log(lines.join("\n"));
}

function openExternalUrl(url) {
  try {
    if (process.platform === "win32") {
      const child = spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" });
      child.unref();
      return true;
    }
    if (process.platform === "darwin") {
      const child = spawn("open", [url], { detached: true, stdio: "ignore" });
      child.unref();
      return true;
    }
    const child = spawn("xdg-open", [url], { detached: true, stdio: "ignore" });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

function buildOauthAuthorizeUrl({
  clientId,
  state,
  redirectUri,
  botScopes,
  userScopes,
  teamId,
}) {
  const endpoint = new URL("https://slack.com/oauth/v2/authorize");
  endpoint.searchParams.set("client_id", clientId);
  endpoint.searchParams.set("state", state);
  endpoint.searchParams.set("redirect_uri", redirectUri);
  if (botScopes.length > 0) endpoint.searchParams.set("scope", botScopes.join(","));
  if (userScopes.length > 0) endpoint.searchParams.set("user_scope", userScopes.join(","));
  if (teamId) endpoint.searchParams.set("team", teamId);
  return endpoint.toString();
}

async function waitForOauthCode({ host, port, callbackPath, state, timeoutMs }) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timeout = null;
    const server = http.createServer((req, res) => {
      const requestUrl = new URL(req.url || "/", `http://${host}:${port}`);
      if (requestUrl.pathname !== callbackPath) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Not found");
        return;
      }

      const receivedError = requestUrl.searchParams.get("error");
      if (receivedError) {
        res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(`Slack OAuth failed: ${receivedError}`);
        settle(new Error(`Slack OAuth failed: ${receivedError}`));
        return;
      }

      const receivedState = requestUrl.searchParams.get("state");
      if (!receivedState || receivedState !== state) {
        res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Invalid OAuth state.");
        settle(new Error("Slack OAuth state mismatch."));
        return;
      }

      const code = requestUrl.searchParams.get("code");
      if (!code) {
        res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Missing authorization code.");
        settle(new Error("OAuth callback did not include `code`."));
        return;
      }

      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Slack OAuth authorization completed. You can close this tab.");
      settle(null, code);
    });

    function settle(error, code) {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      server.close(() => {
        if (error) reject(error);
        else resolve(code);
      });
    }

    server.on("error", (error) => {
      settle(new Error(`Failed to listen on ${host}:${port}: ${error.message}`));
    });

    server.listen(port, host, () => {
      timeout = setTimeout(() => {
        settle(new Error("Timed out waiting for OAuth callback."));
      }, timeoutMs);
    });
  });
}

async function exchangeOauthCode({ clientId, clientSecret, code, redirectUri }) {
  const endpoint = `${SLACK_API_BASE_URL.replace(/\/+$/, "")}/oauth.v2.access`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded; charset=utf-8" },
    body: toUrlEncodedBody({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Slack OAuth token exchange returned non-JSON (HTTP ${response.status}).`);
  }

  if (!response.ok) {
    throw new Error(`Slack OAuth token exchange failed (HTTP ${response.status}): ${data.error || "unknown_error"}`);
  }

  if (!data.ok) {
    throw new Error(`Slack OAuth token exchange failed: ${data.error || "unknown_error"}`);
  }

  return data;
}

function normalizeProfileName(rawName, fallback) {
  const name = (rawName || "").trim();
  if (name) return name;
  return fallback;
}

function upsertOauthProfile(oauthResponse, preferredProfileName) {
  const teamId = oauthResponse.team?.id || "unknown_team";
  const teamName = oauthResponse.team?.name || teamId;
  const authedUserId = oauthResponse.authed_user?.id || oauthResponse.bot_user_id || "unknown_user";
  const profileKey = `${teamId}:${authedUserId}`;

  const tokenStore = loadTokenStore();
  const existing = tokenStore.profiles[profileKey] || {};
  const now = new Date().toISOString();

  tokenStore.profiles[profileKey] = {
    ...existing,
    profile_name: normalizeProfileName(preferredProfileName, `${teamName}-${authedUserId}`),
    team_id: teamId,
    team_name: teamName,
    app_id: oauthResponse.app_id || existing.app_id || "",
    token_type: oauthResponse.token_type || existing.token_type || "",
    bot_user_id: oauthResponse.bot_user_id || existing.bot_user_id || "",
    bot_scope: oauthResponse.scope || existing.bot_scope || "",
    user_scope: oauthResponse.authed_user?.scope || existing.user_scope || "",
    bot_token: oauthResponse.access_token || existing.bot_token || "",
    user_token: oauthResponse.authed_user?.access_token || existing.user_token || "",
    authed_user_id: oauthResponse.authed_user?.id || existing.authed_user_id || "",
    incoming_webhook_url: oauthResponse.incoming_webhook?.url || existing.incoming_webhook_url || "",
    created_at: existing.created_at || now,
    updated_at: now,
  };
  tokenStore.default_profile = profileKey;

  saveTokenStore(tokenStore);
  return { key: profileKey, profile: tokenStore.profiles[profileKey] };
}

function formatTokenProfileSummary(key, profile, isDefault) {
  const flags = [];
  if (isDefault) flags.push("default");
  if (profile.bot_token) flags.push("bot");
  if (profile.user_token) flags.push("user");

  return [
    `${isDefault ? "*" : " "} ${key} (${profile.profile_name || "unnamed"})`,
    `    team=${profile.team_name || profile.team_id || "unknown"} | user=${profile.authed_user_id || "unknown"} | tokens=${flags.join(", ") || "none"}`,
  ].join("\n");
}

async function runOauthLogin(args) {
  const { options } = parseCliArgs(args);
  const clientId = options["client-id"] || process.env.SLACK_CLIENT_ID;
  const clientSecret = options["client-secret"] || process.env.SLACK_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Missing SLACK_CLIENT_ID or SLACK_CLIENT_SECRET. Set env vars or pass --client-id/--client-secret.");
  }

  const host = options.host || OAUTH_CALLBACK_HOST;
  const port = Number(options.port || OAUTH_CALLBACK_PORT);
  const callbackPath = options["callback-path"] || OAUTH_CALLBACK_PATH;
  const redirectUri = options["redirect-uri"] || `http://${host}:${port}${callbackPath}`;
  const timeoutMs = Number(options["timeout-ms"] || OAUTH_TIMEOUT_MS);
  const botScopes = parseScopeList(options.scope || DEFAULT_OAUTH_BOT_SCOPES);
  const userScopes = parseScopeList(options["user-scope"] || DEFAULT_OAUTH_USER_SCOPES);
  const teamId = options.team || process.env.SLACK_OAUTH_TEAM_ID || "";

  if (botScopes.length === 0 && userScopes.length === 0) {
    throw new Error("At least one scope is required. Set --scope or --user-scope.");
  }

  const state = crypto.randomBytes(24).toString("hex");
  const authorizeUrl = buildOauthAuthorizeUrl({
    clientId,
    state,
    redirectUri,
    botScopes,
    userScopes,
    teamId,
  });

  console.log(`[oauth] callback listening on http://${host}:${port}${callbackPath}`);
  console.log(`[oauth] authorize URL:\n${authorizeUrl}`);

  if (!options["no-open"]) {
    const opened = openExternalUrl(authorizeUrl);
    if (!opened) {
      console.log("[oauth] Could not auto-open browser. Open the URL above manually.");
    }
  }

  const code = await waitForOauthCode({ host, port, callbackPath, state, timeoutMs });
  const oauthResponse = await exchangeOauthCode({ clientId, clientSecret, code, redirectUri });
  const { key, profile } = upsertOauthProfile(oauthResponse, options.profile);

  console.log(`[oauth] saved profile: ${profile.profile_name} (${key})`);
  console.log(`[oauth] token store path: ${TOKEN_STORE_PATH}`);
  console.log("[oauth] Next step for MCP clients:");
  console.log(`  setx SLACK_PROFILE \"${profile.profile_name}\"`);
}

function runOauthList() {
  const tokenStore = loadTokenStore();
  const keys = Object.keys(tokenStore.profiles);
  if (keys.length === 0) {
    console.log(`[oauth] no saved profiles in ${TOKEN_STORE_PATH}`);
    return;
  }

  console.log(`[oauth] profiles in ${TOKEN_STORE_PATH}`);
  for (const key of keys) {
    console.log(formatTokenProfileSummary(key, tokenStore.profiles[key], tokenStore.default_profile === key));
  }
}

function runOauthUse(args) {
  const { positionals } = parseCliArgs(args);
  const selector = positionals[0];
  if (!selector) {
    throw new Error("Usage: slack-max-api-mcp oauth use <profile_key_or_name>");
  }

  const tokenStore = loadTokenStore();
  const resolved = resolveTokenStoreProfileBySelector(tokenStore, selector);
  if (!resolved) {
    throw new Error(`Profile not found: ${selector}`);
  }

  tokenStore.default_profile = resolved.key;
  saveTokenStore(tokenStore);
  console.log(`[oauth] default profile set to ${resolved.key} (${resolved.profile.profile_name || "unnamed"})`);
}

function runOauthCurrent() {
  const tokenStore = loadTokenStore();
  const resolved = resolveTokenStoreProfileBySelector(tokenStore, process.env.SLACK_PROFILE);
  if (!resolved) {
    console.log("[oauth] no active profile");
    return;
  }
  console.log(formatTokenProfileSummary(resolved.key, resolved.profile, tokenStore.default_profile === resolved.key));
}

async function runOauthCli(args) {
  const subcommand = (args[0] || "help").toLowerCase();
  const rest = args.slice(1);

  if (subcommand === "help" || subcommand === "--help" || subcommand === "-h") {
    printOauthHelp();
    return;
  }
  if (subcommand === "login") {
    await runOauthLogin(rest);
    return;
  }
  if (subcommand === "list") {
    runOauthList();
    return;
  }
  if (subcommand === "use") {
    runOauthUse(rest);
    return;
  }
  if (subcommand === "current") {
    runOauthCurrent();
    return;
  }

  throw new Error(`Unknown oauth command: ${subcommand}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload, null, 2));
}

function isClaimSessionExpired(session) {
  return !session || Date.now() > Number(session.expires_at || 0);
}

function cleanupExpiredClaimSessions(claimSessions, stateToClaim) {
  for (const [claimToken, session] of claimSessions.entries()) {
    if (!isClaimSessionExpired(session)) continue;
    claimSessions.delete(claimToken);
    if (session.state) stateToClaim.delete(session.state);
  }
}

async function fetchJsonResponse(url, options, label) {
  const response = await fetch(url, options);
  const rawText = await response.text();
  let data;
  try {
    data = JSON.parse(rawText);
  } catch {
    throw new Error(`${label} returned non-JSON (HTTP ${response.status}).`);
  }
  if (!response.ok || !data?.ok) {
    throw new Error(`${label} failed: ${data?.error || `http_${response.status}`}`);
  }
  return data;
}

function printOnboardHelp() {
  const lines = [
    "Slack Max onboard helper (client-side)",
    "",
    "Usage:",
    "  slack-max-api-mcp onboard run",
    "  slack-max-api-mcp onboard run --server https://onboard.example.com",
    "    [--profile NAME] [--team T123] [--scope a,b] [--user-scope c,d]",
    "  slack-max-api-mcp onboard help",
    "",
    "Notes:",
    `  - Default onboard server: ${ONBOARD_SERVER_URL}`,
    "  - This command does not require SLACK_CLIENT_SECRET on team PCs.",
    "  - It opens browser OAuth via central onboarding server and saves tokens locally.",
  ];
  console.log(lines.join("\n"));
}

function printOnboardServerHelp() {
  const lines = [
    "Slack Max onboard server (central)",
    "",
    "Usage:",
    "  slack-max-api-mcp onboard-server start",
    "    [--host 0.0.0.0] [--port 8790] [--public-base-url https://onboard.example.com]",
    "    [--callback-path /slack/oauth/callback]",
    "  slack-max-api-mcp onboard-server help",
    "",
    "Required env vars (server-side only):",
    "  SLACK_CLIENT_ID",
    "  SLACK_CLIENT_SECRET",
    "",
    "Optional env vars:",
    "  SLACK_ONBOARD_SERVER_HOST, SLACK_ONBOARD_SERVER_PORT",
    "  SLACK_ONBOARD_PUBLIC_BASE_URL, SLACK_ONBOARD_SERVER_CALLBACK_PATH",
    "  SLACK_ONBOARD_CLAIM_TTL_MS",
  ];
  console.log(lines.join("\n"));
}

async function runOnboardClient(args) {
  const { options } = parseCliArgs(args);
  const serverBase = String(options.server || ONBOARD_SERVER_URL).trim().replace(/\/+$/, "");
  if (!serverBase) {
    throw new Error("Missing onboard server URL. Use --server or set SLACK_ONBOARD_SERVER_URL.");
  }

  const requestedProfile = String(options.profile || "").trim();
  const requestedTeam = String(options.team || "").trim();
  const requestedScope = parseScopeList(options.scope || "").join(",");
  const requestedUserScope = parseScopeList(options["user-scope"] || "").join(",");

  const bootstrapParams = new URLSearchParams();
  if (requestedProfile) bootstrapParams.set("profile", requestedProfile);
  if (requestedTeam) bootstrapParams.set("team", requestedTeam);
  if (requestedScope) bootstrapParams.set("scope", requestedScope);
  if (requestedUserScope) bootstrapParams.set("user_scope", requestedUserScope);

  const bootstrapUrl = `${serverBase}/onboard/bootstrap${bootstrapParams.toString() ? `?${bootstrapParams.toString()}` : ""}`;
  const bootstrap = await fetchJsonResponse(
    bootstrapUrl,
    { method: "GET", headers: { Accept: "application/json" } },
    "Onboard bootstrap"
  );

  const startUrl = String(bootstrap.onboard_start_url || "");
  const claimToken = String(bootstrap.claim_token || "");
  if (!startUrl || !claimToken) {
    throw new Error("Onboard bootstrap response is missing onboard_start_url or claim_token.");
  }

  const opened = openExternalUrl(startUrl);
  if (!opened) {
    console.log(`[onboard] Open this URL in browser:\n${startUrl}`);
  } else {
    console.log("[onboard] Browser opened for OAuth approval.");
  }

  const pollIntervalMs = Math.max(500, Number(options["poll-ms"] || ONBOARD_POLL_INTERVAL_MS));
  const timeoutMs = Math.max(30_000, Number(options["timeout-ms"] || ONBOARD_TIMEOUT_MS));
  const deadline = Date.now() + timeoutMs;
  const claimUrl = `${serverBase}/onboard/claim?claim=${encodeURIComponent(claimToken)}`;

  while (Date.now() < deadline) {
    await sleep(pollIntervalMs);
    const claimData = await fetchJsonResponse(
      claimUrl,
      { method: "GET", headers: { Accept: "application/json" } },
      "Onboard claim"
    );

    if (claimData.status === "pending") {
      continue;
    }

    if (claimData.status !== "ready") {
      throw new Error(`Unexpected onboard claim status: ${claimData.status || "unknown"}`);
    }

    const oauthResponse = claimData.oauth_response;
    if (!oauthResponse || typeof oauthResponse !== "object") {
      throw new Error("Onboard claim result is missing oauth_response.");
    }

    const { key, profile } = upsertOauthProfile(oauthResponse, claimData.profile || requestedProfile || "");
    console.log(`[onboard] saved profile: ${profile.profile_name} (${key})`);
    console.log(`[onboard] token store path: ${TOKEN_STORE_PATH}`);
    console.log("[onboard] Next step for MCP clients:");
    console.log(`  setx SLACK_PROFILE \"${profile.profile_name}\"`);
    return;
  }

  throw new Error("Timed out waiting for central onboarding completion.");
}

async function runOnboardServerStart(args) {
  const { options } = parseCliArgs(args);
  const clientId = options["client-id"] || process.env.SLACK_CLIENT_ID;
  const clientSecret = options["client-secret"] || process.env.SLACK_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Missing SLACK_CLIENT_ID or SLACK_CLIENT_SECRET on onboarding server.");
  }

  const host = String(options.host || ONBOARD_SERVER_HOST);
  const port = Number(options.port || ONBOARD_SERVER_PORT);
  const callbackPath = String(options["callback-path"] || ONBOARD_CALLBACK_PATH);
  const publicBaseUrl = String(options["public-base-url"] || ONBOARD_PUBLIC_BASE_URL).replace(/\/+$/, "");
  const claimTtlMs = Math.max(60_000, Number(options["claim-ttl-ms"] || ONBOARD_CLAIM_TTL_MS));
  const redirectUri = new URL(callbackPath, `${publicBaseUrl}/`).toString();

  const claimSessions = new Map();
  const stateToClaim = new Map();

  const server = http.createServer(async (req, res) => {
    try {
      cleanupExpiredClaimSessions(claimSessions, stateToClaim);
      const method = req.method || "GET";
      const requestUrl = new URL(req.url || "/", `http://${host}:${port}`);

      if (method === "GET" && requestUrl.pathname === "/health") {
        sendJson(res, 200, {
          ok: true,
          service: SERVER_NAME,
          mode: "onboard_server",
          public_base_url: publicBaseUrl,
          callback_path: callbackPath,
        });
        return;
      }

      if (method === "GET" && requestUrl.pathname === "/onboard/bootstrap") {
        const profile = String(requestUrl.searchParams.get("profile") || "").trim();
        const team = String(requestUrl.searchParams.get("team") || "").trim();
        const botScopes = parseScopeList(requestUrl.searchParams.get("scope") || DEFAULT_OAUTH_BOT_SCOPES);
        const userScopes = parseScopeList(
          requestUrl.searchParams.get("user_scope") || DEFAULT_OAUTH_USER_SCOPES
        );

        if (botScopes.length === 0 && userScopes.length === 0) {
          sendJson(res, 400, { ok: false, error: "missing_scope" });
          return;
        }

        const claimToken = crypto.randomBytes(32).toString("hex");
        const expiresAt = Date.now() + claimTtlMs;
        claimSessions.set(claimToken, {
          claim_token: claimToken,
          profile,
          team,
          bot_scopes: botScopes,
          user_scopes: userScopes,
          oauth_response: null,
          state: "",
          expires_at: expiresAt,
        });

        const startParams = new URLSearchParams();
        startParams.set("claim", claimToken);
        const startUrl = `${publicBaseUrl}/onboard/start?${startParams.toString()}`;

        sendJson(res, 200, {
          ok: true,
          onboard_start_url: startUrl,
          claim_token: claimToken,
          profile,
          expires_at: new Date(expiresAt).toISOString(),
        });
        return;
      }

      if (method === "GET" && requestUrl.pathname === "/onboard/start") {
        const claimToken = String(requestUrl.searchParams.get("claim") || "");
        const session = claimSessions.get(claimToken);
        if (!session || isClaimSessionExpired(session)) {
          sendText(res, 400, "Invalid or expired onboarding claim.");
          return;
        }

        const state = crypto.randomBytes(24).toString("hex");
        session.state = state;
        stateToClaim.set(state, claimToken);

        const authorizeUrl = buildOauthAuthorizeUrl({
          clientId,
          state,
          redirectUri,
          botScopes: session.bot_scopes,
          userScopes: session.user_scopes,
          teamId: session.team,
        });

        res.writeHead(302, { Location: authorizeUrl });
        res.end();
        return;
      }

      if (method === "GET" && requestUrl.pathname === callbackPath) {
        const receivedError = requestUrl.searchParams.get("error");
        if (receivedError) {
          sendText(res, 400, `Slack OAuth failed: ${receivedError}`);
          return;
        }

        const state = requestUrl.searchParams.get("state");
        const code = requestUrl.searchParams.get("code");
        if (!state || !code) {
          sendText(res, 400, "Missing state/code.");
          return;
        }

        const claimToken = stateToClaim.get(state);
        if (!claimToken) {
          sendText(res, 400, "Invalid OAuth state.");
          return;
        }

        const session = claimSessions.get(claimToken);
        if (!session || isClaimSessionExpired(session)) {
          sendText(res, 400, "Expired onboarding claim.");
          return;
        }

        const oauthResponse = await exchangeOauthCode({ clientId, clientSecret, code, redirectUri });
        session.oauth_response = oauthResponse;
        stateToClaim.delete(state);
        sendText(res, 200, "Slack OAuth completed. Return to your CLI and wait for onboarding to finish.");
        return;
      }

      if (method === "GET" && requestUrl.pathname === "/onboard/claim") {
        const claimToken = String(requestUrl.searchParams.get("claim") || "");
        const session = claimSessions.get(claimToken);
        if (!session || isClaimSessionExpired(session)) {
          sendJson(res, 400, { ok: false, error: "invalid_or_expired_claim" });
          return;
        }

        if (!session.oauth_response) {
          sendJson(res, 200, { ok: true, status: "pending" });
          return;
        }

        sendJson(res, 200, {
          ok: true,
          status: "ready",
          profile: session.profile || "",
          oauth_response: session.oauth_response,
        });
        claimSessions.delete(claimToken);
        return;
      }

      sendJson(res, 404, { ok: false, error: "not_found" });
    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });

  console.error(`[${SERVER_NAME}] onboard server listening at http://${host}:${port}`);
  console.error(`[${SERVER_NAME}] public base: ${publicBaseUrl}`);
  console.error(`[${SERVER_NAME}] bootstrap URL: ${publicBaseUrl}/onboard/bootstrap`);
}

async function runOnboardCli(args) {
  const subcommand = (args[0] || "help").toLowerCase();
  const rest = args.slice(1);

  if (subcommand === "help" || subcommand === "--help" || subcommand === "-h") {
    printOnboardHelp();
    return;
  }
  if (subcommand === "run") {
    await runOnboardClient(rest);
    return;
  }

  throw new Error(`Unknown onboard command: ${subcommand}`);
}

async function runOnboardServerCli(args) {
  const subcommand = (args[0] || "help").toLowerCase();
  const rest = args.slice(1);

  if (subcommand === "help" || subcommand === "--help" || subcommand === "-h") {
    printOnboardServerHelp();
    return;
  }
  if (subcommand === "start") {
    await runOnboardServerStart(rest);
    return;
  }

  throw new Error(`Unknown onboard-server command: ${subcommand}`);
}

function loadCatalog() {
  if (!fs.existsSync(CATALOG_PATH)) {
    return { methods: [], scopes: [], totals: {} };
  }

  try {
    const raw = fs.readFileSync(CATALOG_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return parsed;
  } catch (error) {
    throw new Error(`Failed to load catalog at ${CATALOG_PATH}: ${error}`);
  }
}

function toolNameFromMethod(method, usedNames) {
  const base = `${METHOD_TOOL_PREFIX}_${method.replace(/[^a-zA-Z0-9]/g, "_")}`;
  if (!usedNames.has(base)) {
    usedNames.add(base);
    return base;
  }

  let idx = 2;
  while (usedNames.has(`${base}_${idx}`)) idx += 1;
  const name = `${base}_${idx}`;
  usedNames.add(name);
  return name;
}

function normalizeSearchTokens(value) {
  return String(value || "")
    .toLowerCase()
    .split(/[^a-z0-9_.-]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function compactCatalogMethodInfo(methodInfo, options = {}) {
  const includeScopes = options.includeScopes !== false;
  const includeUrl = options.includeUrl === true;
  const out = {
    method: methodInfo?.method || "",
    family: methodInfo?.family || "",
    description: methodInfo?.description || "",
  };
  if (includeScopes) {
    out.scopes = Array.isArray(methodInfo?.scopes) ? methodInfo.scopes : [];
  }
  if (includeUrl) {
    out.url = methodInfo?.url || "";
  }
  return out;
}

function scoreCatalogMethod(methodInfo, tokens) {
  if (!Array.isArray(tokens) || tokens.length === 0) return 0;
  const method = String(methodInfo?.method || "").toLowerCase();
  const description = String(methodInfo?.description || "").toLowerCase();
  const family = String(methodInfo?.family || "").toLowerCase();
  const scopes = Array.isArray(methodInfo?.scopes) ? methodInfo.scopes.join(" ").toLowerCase() : "";

  let score = 0;
  for (const token of tokens) {
    if (!token) continue;
    if (method.includes(token)) score += 8;
    if (description.includes(token)) score += 4;
    if (family.includes(token)) score += 3;
    if (scopes.includes(token)) score += 2;
  }
  return score;
}

function findCatalogMethods(catalog, query, maxItems = 10) {
  const methods = Array.isArray(catalog?.methods) ? catalog.methods : [];
  const size = Math.max(1, Math.min(50, Number(maxItems) || 10));
  const tokens = normalizeSearchTokens(query);

  if (tokens.length === 0) {
    return methods.slice(0, size);
  }

  return methods
    .map((methodInfo) => ({
      methodInfo,
      score: scoreCatalogMethod(methodInfo, tokens),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return String(a.methodInfo?.method || "").localeCompare(String(b.methodInfo?.method || ""));
    })
    .slice(0, size)
    .map((item) => item.methodInfo);
}

function findCatalogMethodByExactName(catalog, methodName) {
  const target = String(methodName || "").trim();
  if (!target) return null;
  const methods = Array.isArray(catalog?.methods) ? catalog.methods : [];
  return methods.find((methodInfo) => methodInfo?.method === target) || null;
}

async function executeSlackHttpRequest({
  url,
  http_method,
  query,
  json_body,
  form_body,
  headers,
  token_override,
}) {
  const tokenCandidate = requireSlackTokenCandidate(token_override);
  const method = http_method || "GET";

  const endpoint = new URL(url);
  for (const [k, v] of Object.entries(toRecordObject(query))) {
    if (v === undefined || v === null) continue;
    endpoint.searchParams.set(k, String(v));
  }

  const reqHeaders = {
    Authorization: 
      "Bearer " + tokenCandidate.token,
    ...(headers || {}),
  };

  let body;
  if (form_body && Object.keys(form_body).length > 0) {
    reqHeaders["Content-Type"] = "application/x-www-form-urlencoded; charset=utf-8";
    body = toUrlEncodedBody(form_body);
  } else if (json_body && Object.keys(json_body).length > 0) {
    reqHeaders["Content-Type"] = "application/json; charset=utf-8";
    body = JSON.stringify(json_body);
  }

  const res = await fetch(endpoint.toString(), {
    method,
    headers: reqHeaders,
    body,
  });

  const text = await res.text();
  let parsedBody = text;
  try {
    parsedBody = JSON.parse(text);
  } catch {
    // Keep plain text when response is not JSON.
  }

  return {
    url: endpoint.toString(),
    status: res.status,
    ok: res.ok,
    headers: Object.fromEntries(res.headers.entries()),
    body: parsedBody,
  };
}

function registerSmartGatewayTools(server, catalog) {
  server.registerTool(
    "gateway_plan",
    {
      description:
        "Plan a Slack task with minimal context. Returns ranked candidate methods and the next actions.",
      inputSchema: {
        goal: z.string().min(3),
        max_methods: z.number().int().min(1).max(20).optional(),
      },
    },
    async ({ goal, max_methods }) =>
      safeToolRun(async () => {
        const candidates = findCatalogMethods(catalog, goal, max_methods ?? 8).map((methodInfo) =>
          compactCatalogMethodInfo(methodInfo)
        );
        return {
          mode: TOOL_EXPOSURE_MODE,
          goal,
          candidate_methods: candidates,
          next_steps: [
            "1) Use gateway_load to inspect candidate methods in detail.",
            "2) Execute the chosen method with gateway_run(action=method).",
            "3) Summarize output and repeat only when additional actions are needed.",
          ],
          note:
            "This planner keeps tool exposure small by routing through a minimal tool surface.",
        };
      })
  );

  server.registerTool(
    "gateway_load",
    {
      description:
        "Load only the method references you need. Supports exact method lookup or query search.",
      inputSchema: {
        method: z.string().optional(),
        query: z.string().optional(),
        max_items: z.number().int().min(1).max(30).optional(),
        include_scopes: z.boolean().optional(),
        include_url: z.boolean().optional(),
      },
    },
    async ({ method, query, max_items, include_scopes, include_url }) =>
      safeToolRun(async () => {
        if (!method && !query) {
          throw new Error("Either `method` or `query` is required.");
        }

        const includeScopes = include_scopes !== false;
        const includeUrl = include_url === true;
        let methods = [];

        if (method) {
          const exact = findCatalogMethodByExactName(catalog, method);
          methods = exact ? [exact] : [];
        } else {
          methods = findCatalogMethods(catalog, query, max_items ?? 10);
        }

        return {
          mode: TOOL_EXPOSURE_MODE,
          count: methods.length,
          methods: methods.map((methodInfo) =>
            compactCatalogMethodInfo(methodInfo, { includeScopes, includeUrl })
          ),
        };
      })
  );

  server.registerTool(
    "gateway_run",
    {
      description:
        "Run a Slack action through a single gateway tool. Supports Slack Web API method call and generic HTTP call.",
      inputSchema: {
        action: z.enum(["method", "http"]),
        method: z.string().optional(),
        params: z.record(z.string(), z.any()).optional(),
        preferred_token_type: z.enum(["bot", "user", "generic", "auto"]).optional(),
        url: z.string().url().optional(),
        http_method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).optional(),
        query: z.record(z.string(), z.any()).optional(),
        json_body: z.record(z.string(), z.any()).optional(),
        form_body: z.record(z.string(), z.any()).optional(),
        headers: z.record(z.string(), z.string()).optional(),
        token_override: z.string().optional(),
      },
    },
    async ({
      action,
      method,
      params,
      preferred_token_type,
      url,
      http_method,
      query,
      json_body,
      form_body,
      headers,
      token_override,
    }) =>
      safeToolRun(async () => {
        if (action === "method") {
          if (!method) throw new Error("`method` is required when action=method.");
          const data = await callSlackApi(
            method,
            params || {},
            token_override,
            preferred_token_type ? { preferredTokenType: preferred_token_type } : {}
          );
          return { action, method, data };
        }

        if (!url) throw new Error("`url` is required when action=http.");
        const data = await executeSlackHttpRequest({
          url,
          http_method,
          query,
          json_body,
          form_body,
          headers,
          token_override,
        });
        return { action, data };
      })
  );

  server.registerTool(
    "gateway_info",
    {
      description: "Return gateway exposure mode and lightweight tool registration summary.",
      inputSchema: {},
    },
    async () =>
      safeToolRun(async () => {
        return {
          mode: TOOL_EXPOSURE_MODE,
          execution_mode: "local",
          method_tools_enabled: ENABLE_METHOD_TOOLS,
          max_method_tools: MAX_METHOD_TOOLS,
          methods_in_catalog: Array.isArray(catalog?.methods) ? catalog.methods.length : 0,
          exposed_tools_hint: "smart mode keeps the tool surface compact via gateway_plan/load/run/info.",
        };
      })
  );

  return { registered: 4 };
}

function registerCoreTools(server) {
  server.registerTool(
    "slack_api_call",
    {
      description: "Call any Slack Web API method directly.",
      inputSchema: {
        method: z
          .string()
          .min(3)
          .regex(/^[a-z][a-zA-Z0-9_.]+$/, "Method must look like chat.postMessage"),
        params: z.record(z.string(), z.any()).optional(),
        token_override: z.string().optional(),
      },
    },
    async ({ method, params, token_override }) =>
      safeToolRun(async () => {
        const data = await callSlackApi(method, params || {}, token_override);
        return { method, data };
      })
  );

  server.registerTool(
    "slack_http_api_call",
    {
      description:
        "Generic HTTP call for Slack APIs outside standard Web API methods (SCIM/Audit/Legal Holds).",
      inputSchema: {
        url: z.string().url(),
        http_method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).optional(),
        query: z.record(z.string(), z.any()).optional(),
        json_body: z.record(z.string(), z.any()).optional(),
        form_body: z.record(z.string(), z.any()).optional(),
        headers: z.record(z.string(), z.string()).optional(),
        token_override: z.string().optional(),
      },
    },
    async ({ url, http_method, query, json_body, form_body, headers, token_override }) =>
      safeToolRun(async () => {
        return executeSlackHttpRequest({
          url,
          http_method,
          query,
          json_body,
          form_body,
          headers,
          token_override,
        });
      })
  );

  server.registerTool(
    "search_messages_files",
    {
      description:
        "Search messages and files. Uses search.messages and search.files and returns both.",
      inputSchema: {
        query: z.string().min(1),
        count: z.number().int().min(1).max(100).optional(),
        page: z.number().int().min(1).optional(),
        sort: z.enum(["score", "timestamp"]).optional(),
        sort_dir: z.enum(["asc", "desc"]).optional(),
        include_messages: z.boolean().optional(),
        include_files: z.boolean().optional(),
        token_override: z.string().optional(),
      },
    },
    async ({
      query,
      count,
      page,
      sort,
      sort_dir,
      include_messages,
      include_files,
      token_override,
    }) =>
      safeToolRun(async () => {
        const shouldSearchMessages = include_messages !== false;
        const shouldSearchFiles = include_files !== false;
        const sharedParams = {
          query,
          count: count ?? 20,
          page: page ?? 1,
          sort,
          sort_dir,
        };

        let messages = null;
        let files = null;

        if (shouldSearchMessages) {
          messages = await callSlackApi("search.messages", sharedParams, token_override);
        }
        if (shouldSearchFiles) {
          files = await callSlackApi("search.files", sharedParams, token_override);
        }

        return {
          query,
          messages: messages ? messages.messages : null,
          files: files ? files.files : null,
        };
      })
  );

  server.registerTool(
    "search_users",
    {
      description:
        "Find users by partial match on id/name/display_name/email using users.list and local filtering.",
      inputSchema: {
        query: z.string().optional(),
        limit: z.number().int().min(1).max(1000).optional(),
        include_locale: z.boolean().optional(),
        include_deleted: z.boolean().optional(),
        include_bots: z.boolean().optional(),
        cursor: z.string().optional(),
        token_override: z.string().optional(),
      },
    },
    async ({
      query,
      limit,
      include_locale,
      include_deleted,
      include_bots,
      cursor,
      token_override,
    }) =>
      safeToolRun(async () => {
        const listData = await callSlackApi(
          "users.list",
          {
            limit: limit ?? 200,
            include_locale: include_locale ?? true,
            cursor,
          },
          token_override
        );

        const normalizedQuery = query ? query.toLowerCase() : null;
        let users = Array.isArray(listData.members) ? listData.members : [];

        if (include_deleted !== true) {
          users = users.filter((u) => !u.deleted);
        }
        if (include_bots !== true) {
          users = users.filter((u) => !u.is_bot && !u.is_app_user);
        }
        if (normalizedQuery) {
          users = users.filter((u) => {
            const candidates = [
              u.id,
              u.name,
              u.real_name,
              u.profile?.display_name,
              u.profile?.real_name,
              u.profile?.email,
            ]
              .filter((v) => typeof v === "string")
              .map((v) => v.toLowerCase());
            return candidates.some((value) => value.includes(normalizedQuery));
          });
        }

        return {
          users,
          next_cursor: listData.response_metadata?.next_cursor || null,
          count: users.length,
        };
      })
  );

  server.registerTool(
    "search_channels",
    {
      description:
        "Find channels by partial match on name/topic/purpose using conversations.list and local filtering.",
      inputSchema: {
        query: z.string().optional(),
        types: z.string().optional(),
        exclude_archived: z.boolean().optional(),
        limit: z.number().int().min(1).max(1000).optional(),
        cursor: z.string().optional(),
        token_override: z.string().optional(),
      },
    },
    async ({ query, types, exclude_archived, limit, cursor, token_override }) =>
      safeToolRun(async () => {
        const data = await callSlackApi(
          "conversations.list",
          {
            types: types || "public_channel,private_channel",
            exclude_archived: exclude_archived ?? true,
            limit: limit ?? 200,
            cursor,
          },
          token_override
        );

        let channels = Array.isArray(data.channels) ? data.channels : [];
        if (query) {
          const normalizedQuery = query.toLowerCase();
          channels = channels.filter((channel) => {
            const candidates = [channel.id, channel.name, channel.purpose?.value, channel.topic?.value]
              .filter((v) => typeof v === "string")
              .map((v) => v.toLowerCase());
            return candidates.some((value) => value.includes(normalizedQuery));
          });
        }

        return {
          channels,
          next_cursor: data.response_metadata?.next_cursor || null,
          count: channels.length,
        };
      })
  );

  server.registerTool(
    "send_message",
    {
      description: "Send a message using chat.postMessage.",
      inputSchema: {
        channel: z.string().min(1),
        text: z.string().min(1),
        thread_ts: z.string().optional(),
        blocks: z.any().optional(),
        mrkdwn: z.boolean().optional(),
        unfurl_links: z.boolean().optional(),
        unfurl_media: z.boolean().optional(),
        token_override: z.string().optional(),
      },
    },
    async ({ channel, text, thread_ts, blocks, mrkdwn, unfurl_links, unfurl_media, token_override }) =>
      safeToolRun(async () => {
        const data = await callSlackApi(
          "chat.postMessage",
          {
            channel,
            text,
            thread_ts,
            blocks: parseJsonMaybe(blocks),
            mrkdwn,
            unfurl_links,
            unfurl_media,
          },
          token_override
        );

        return {
          channel: data.channel,
          ts: data.ts,
          message: data.message,
        };
      })
  );

  server.registerTool(
    "read_channel",
    {
      description: "Read channel history with conversations.history.",
      inputSchema: {
        channel: z.string().min(1),
        limit: z.number().int().min(1).max(1000).optional(),
        cursor: z.string().optional(),
        oldest: z.string().optional(),
        latest: z.string().optional(),
        inclusive: z.boolean().optional(),
        token_override: z.string().optional(),
      },
    },
    async ({ channel, limit, cursor, oldest, latest, inclusive, token_override }) =>
      safeToolRun(async () => {
        const data = await callSlackApi(
          "conversations.history",
          {
            channel,
            limit: limit ?? 50,
            cursor,
            oldest,
            latest,
            inclusive,
          },
          token_override
        );

        return {
          channel,
          messages: data.messages || [],
          has_more: Boolean(data.has_more),
          next_cursor: data.response_metadata?.next_cursor || null,
        };
      })
  );

  server.registerTool(
    "read_thread",
    {
      description: "Read a thread using conversations.replies.",
      inputSchema: {
        channel: z.string().min(1),
        thread_ts: z.string().min(1),
        limit: z.number().int().min(1).max(1000).optional(),
        cursor: z.string().optional(),
        oldest: z.string().optional(),
        latest: z.string().optional(),
        inclusive: z.boolean().optional(),
        token_override: z.string().optional(),
      },
    },
    async ({ channel, thread_ts, limit, cursor, oldest, latest, inclusive, token_override }) =>
      safeToolRun(async () => {
        const data = await callSlackApi(
          "conversations.replies",
          {
            channel,
            ts: thread_ts,
            limit: limit ?? 50,
            cursor,
            oldest,
            latest,
            inclusive,
          },
          token_override
        );

        return {
          channel,
          thread_ts,
          messages: data.messages || [],
          has_more: Boolean(data.has_more),
          next_cursor: data.response_metadata?.next_cursor || null,
        };
      })
  );

  server.registerTool(
    "create_canvas",
    {
      description: "Create a canvas using canvases.create. Pass Slack params in `params`.",
      inputSchema: {
        params: z.record(z.string(), z.any()),
        token_override: z.string().optional(),
      },
    },
    async ({ params, token_override }) =>
      safeToolRun(async () => {
        const data = await callSlackApi("canvases.create", params, token_override);
        return data;
      })
  );

  server.registerTool(
    "update_canvas",
    {
      description: "Update a canvas using canvases.edit. Pass Slack params in `params`.",
      inputSchema: {
        params: z.record(z.string(), z.any()),
        token_override: z.string().optional(),
      },
    },
    async ({ params, token_override }) =>
      safeToolRun(async () => {
        const data = await callSlackApi("canvases.edit", params, token_override);
        return data;
      })
  );

  server.registerTool(
    "read_canvas",
    {
      description: "Read canvas content using canvases.sections.lookup. Pass Slack params in `params`.",
      inputSchema: {
        params: z.record(z.string(), z.any()),
        token_override: z.string().optional(),
      },
    },
    async ({ params, token_override }) =>
      safeToolRun(async () => {
        const data = await callSlackApi("canvases.sections.lookup", params, token_override);
        return data;
      })
  );

  server.registerTool(
    "read_user_profile",
    {
      description: "Read user info/profile using users.info plus users.profile.get (best effort).",
      inputSchema: {
        user: z.string().min(1),
        include_locale: z.boolean().optional(),
        include_labels: z.boolean().optional(),
        token_override: z.string().optional(),
      },
    },
    async ({ user, include_locale, include_labels, token_override }) =>
      safeToolRun(async () => {
        const info = await callSlackApi(
          "users.info",
          { user, include_locale: include_locale ?? true },
          token_override
        );

        let profile = null;
        try {
          const profileData = await callSlackApi(
            "users.profile.get",
            { user, include_labels: include_labels ?? true },
            token_override
          );
          profile = profileData.profile || null;
        } catch {
          profile = info.user?.profile || null;
        }

        return { user: info.user || null, profile };
      })
  );

  return { registered: 12 };
}

function registerCatalogMethodTools(server, catalog) {
  if (!ENABLE_METHOD_TOOLS) return { registered: 0 };

  const methods = Array.isArray(catalog.methods) ? catalog.methods : [];
  const limited = MAX_METHOD_TOOLS > 0 ? methods.slice(0, MAX_METHOD_TOOLS) : methods;

  const usedNames = new Set();
  let registered = 0;

  for (const methodInfo of limited) {
    const method = methodInfo?.method;
    if (!method || typeof method !== "string") continue;

    const toolName = toolNameFromMethod(method, usedNames);
    const descriptionParts = [
      `Slack Web API method wrapper for ${method}.`,
      methodInfo.description ? `Official: ${methodInfo.description}` : "",
      Array.isArray(methodInfo.scopes) && methodInfo.scopes.length
        ? `Scopes: ${methodInfo.scopes.join(", ")}`
        : "",
    ].filter(Boolean);

    server.registerTool(
      toolName,
      {
        description: descriptionParts.join(" "),
        inputSchema: {
          params: z.record(z.string(), z.any()).optional(),
          token_override: z.string().optional(),
        },
      },
      async ({ params, token_override }) =>
        safeToolRun(async () => {
          const data = await callSlackApi(method, params || {}, token_override);
          return { method, data };
        })
    );
    registered += 1;
  }

  server.registerTool(
    "slack_method_tools_info",
    {
      description: "Return summary for catalog-driven method tools currently loaded.",
      inputSchema: {},
    },
    async () =>
      safeToolRun(async () => {
        const tokenStore = loadTokenStore();
        const activeProfile = resolveTokenStoreProfileBySelector(tokenStore, process.env.SLACK_PROFILE);
        return {
          catalog_path: CATALOG_PATH,
          execution_mode: "local",
          method_tools_enabled: ENABLE_METHOD_TOOLS,
          max_method_tools: MAX_METHOD_TOOLS,
          methods_in_catalog: methods.length,
          method_tools_registered: registered,
          method_tool_prefix: METHOD_TOOL_PREFIX,
          token_store_path: TOKEN_STORE_PATH,
          active_profile: activeProfile
            ? {
                key: activeProfile.key,
                profile_name: activeProfile.profile?.profile_name || "",
                team_id: activeProfile.profile?.team_id || "",
              }
            : null,
          env_tokens_present: {
            bot: Boolean(process.env.SLACK_BOT_TOKEN),
            user: Boolean(process.env.SLACK_USER_TOKEN),
            generic: Boolean(process.env.SLACK_TOKEN),
          },
          env_example_fallback_enabled: ALLOW_ENV_EXAMPLE_FALLBACK,
        };
      })
  );

  return { registered };
}

async function startMcpServer() {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { logging: {} } }
  );

  const catalog = loadCatalog();
  let coreStats = { registered: 0 };
  let smartStats = { registered: 0 };
  let compatCoreStats = { registered: 0 };

  if (TOOL_EXPOSURE_MODE === "legacy") {
    coreStats = registerCoreTools(server);
  } else {
    smartStats = registerSmartGatewayTools(server, catalog);
    if (SMART_COMPAT_CORE_TOOLS) {
      compatCoreStats = registerCoreTools(server);
    }
    coreStats = { registered: smartStats.registered + compatCoreStats.registered };
  }
  const methodStats = registerCatalogMethodTools(server, catalog);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  const catalogCount =
    catalog && catalog.totals && typeof catalog.totals.methods === "number"
      ? catalog.totals.methods
      : Array.isArray(catalog.methods)
      ? catalog.methods.length
      : 0;

  console.error(
    `[${SERVER_NAME}] connected via stdio | mode=${TOOL_EXPOSURE_MODE} | core_tools_registered=${coreStats?.registered ?? 0} | smart_tools_registered=${smartStats.registered} | compat_core_tools_registered=${compatCoreStats.registered} | catalog_methods=${catalogCount} | method_tools_registered=${methodStats.registered}`
  );
}

async function runEntryPoint() {
  const [firstArg, ...rest] = process.argv.slice(2);
  const command = (firstArg || "").toLowerCase();
  if (command === "oauth") {
    await runOauthCli(rest);
    return;
  }
  if (command === "onboard") {
    await runOnboardCli(rest);
    return;
  }
  if (command === "onboard-server") {
    await runOnboardServerCli(rest);
    return;
  }
  if (command === "help" || command === "--help" || command === "-h") {
    console.log("Usage:");
    console.log("  slack-max-api-mcp");
    console.log("  slack-max-api-mcp oauth <login|list|use|current|help>");
    console.log("  slack-max-api-mcp onboard <run|help>");
    console.log("  slack-max-api-mcp onboard-server <start|help>");
    return;
  }
  if (command) {
    throw new Error(
      `Unknown command: ${command}. Use 'slack-max-api-mcp help' for available commands.`
    );
  }
  await startMcpServer();
}

runEntryPoint().catch((error) => {
  console.error(`[${SERVER_NAME}] fatal error:`, error);
  process.exit(1);
});
