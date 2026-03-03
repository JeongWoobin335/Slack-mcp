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
const ENABLE_METHOD_TOOLS = process.env.SLACK_ENABLE_METHOD_TOOLS !== "false";
const MAX_METHOD_TOOLS = Number(process.env.SLACK_MAX_METHOD_TOOLS || 0);
const ENV_EXAMPLE_PATH = path.join(process.cwd(), ".env.example");
const TOKEN_STORE_PATH =
  process.env.SLACK_TOKEN_STORE_PATH ||
  path.join(os.homedir(), ".slack-max-api-mcp", "tokens.json");
const CLIENT_CONFIG_PATH =
  process.env.SLACK_CLIENT_CONFIG_PATH ||
  path.join(os.homedir(), ".slack-max-api-mcp", "client.json");
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
const GATEWAY_API_KEY = process.env.SLACK_GATEWAY_API_KEY || "";
const GATEWAY_PROFILE = process.env.SLACK_GATEWAY_PROFILE || "";
const GATEWAY_HOST = process.env.SLACK_GATEWAY_HOST || "127.0.0.1";
const GATEWAY_PORT = Number(process.env.SLACK_GATEWAY_PORT || 8790);
const GATEWAY_PUBLIC_BASE_URL =
  process.env.SLACK_GATEWAY_PUBLIC_BASE_URL || `http://${GATEWAY_HOST}:${GATEWAY_PORT}`;
const GATEWAY_ALLOW_PUBLIC = process.env.SLACK_GATEWAY_ALLOW_PUBLIC === "true";
const GATEWAY_SHARED_SECRET = process.env.SLACK_GATEWAY_SHARED_SECRET || GATEWAY_API_KEY;
const GATEWAY_CLIENT_API_KEY =
  process.env.SLACK_GATEWAY_CLIENT_API_KEY || GATEWAY_API_KEY || GATEWAY_SHARED_SECRET;
const GATEWAY_PUBLIC_ONBOARD_ENABLED = process.env.SLACK_GATEWAY_PUBLIC_ONBOARD === "true";
const GATEWAY_PUBLIC_ONBOARD_EXPOSE_API_KEY =
  process.env.SLACK_GATEWAY_PUBLIC_ONBOARD_EXPOSE_API_KEY === "true";
const GATEWAY_PUBLIC_ONBOARD_API_KEY = process.env.SLACK_GATEWAY_PUBLIC_ONBOARD_API_KEY || "";
const GATEWAY_PUBLIC_ONBOARD_PROFILE_PREFIX =
  process.env.SLACK_GATEWAY_PUBLIC_ONBOARD_PROFILE_PREFIX || "auto";
const GATEWAY_STATE_TTL_MS = Number(process.env.SLACK_GATEWAY_STATE_TTL_MS || 15 * 60 * 1000);
const INVITE_TOKEN_DEFAULT_DAYS = Number(process.env.SLACK_INVITE_TOKEN_DEFAULT_DAYS || 7);
const AUTO_ONBOARD_ENABLED = process.env.SLACK_AUTO_ONBOARD !== "false";
const AUTO_ONBOARD_GATEWAY =
  process.env.SLACK_AUTO_ONBOARD_GATEWAY || process.env.SLACK_ONBOARD_GATEWAY_URL || "";
const AUTO_ONBOARD_PROFILE = process.env.SLACK_AUTO_ONBOARD_PROFILE || "";
const AUTO_ONBOARD_TOKEN = process.env.SLACK_AUTO_ONBOARD_TOKEN || process.env.SLACK_ONBOARD_TOKEN || "";
const AUTO_ONBOARD_URL = process.env.SLACK_AUTO_ONBOARD_URL || process.env.SLACK_ONBOARD_URL || "";
const AUTO_ONBOARD_PROFILE_PREFIX = process.env.SLACK_AUTO_ONBOARD_PROFILE_PREFIX || "auto";
const ONBOARD_PACKAGE_SPEC =
  process.env.SLACK_ONBOARD_PACKAGE_SPEC ||
  process.env.SLACK_ONBOARD_INSTALL_SPEC ||
  "slack-max-api-mcp@latest";
const ONBOARD_SKIP_TLS_VERIFY = process.env.SLACK_ONBOARD_SKIP_TLS_VERIFY === "true";

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

function normalizeOnboardNamePart(value, fallback) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!normalized) return fallback;
  return normalized;
}

function createAutoOnboardProfileName(prefix = "auto") {
  let username = "user";
  try {
    username = os.userInfo().username || process.env.USERNAME || process.env.USER || "user";
  } catch {
    username = process.env.USERNAME || process.env.USER || "user";
  }
  const host = os.hostname() || "host";
  const profilePrefix = normalizeOnboardNamePart(prefix, "auto");
  const userPart = normalizeOnboardNamePart(username, "user");
  const hostPart = normalizeOnboardNamePart(host, "host");
  const rand = crypto.randomBytes(3).toString("hex");
  return `${profilePrefix}-${userPart}-${hostPart}-${rand}`.slice(0, 80);
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

function emptyClientConfig() {
  return {
    version: 1,
    gateway_url: "",
    gateway_api_key: "",
    profile: "",
    updated_at: "",
  };
}

function normalizeClientConfig(value) {
  if (!value || typeof value !== "object") return emptyClientConfig();
  return { ...emptyClientConfig(), ...value };
}

function loadClientConfig() {
  if (!fs.existsSync(CLIENT_CONFIG_PATH)) return emptyClientConfig();
  try {
    const parsed = JSON.parse(fs.readFileSync(CLIENT_CONFIG_PATH, "utf8"));
    return normalizeClientConfig(parsed);
  } catch {
    return emptyClientConfig();
  }
}

function saveClientConfig(config) {
  ensureParentDirectory(CLIENT_CONFIG_PATH);
  fs.writeFileSync(CLIENT_CONFIG_PATH, JSON.stringify(normalizeClientConfig(config), null, 2), "utf8");
}

function getRuntimeGatewayConfig() {
  const config = loadClientConfig();
  return {
    url: (process.env.SLACK_GATEWAY_URL || config.gateway_url || "").replace(/\/+$/, ""),
    apiKey: process.env.SLACK_GATEWAY_API_KEY || config.gateway_api_key || "",
    profile:
      process.env.SLACK_PROFILE ||
      process.env.SLACK_GATEWAY_PROFILE ||
      config.profile ||
      GATEWAY_PROFILE ||
      "",
  };
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
      options.profileSelector || process.env.SLACK_PROFILE || GATEWAY_PROFILE
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

function buildGatewayAuthHeaders(apiKey) {
  const headers = { "Content-Type": "application/json; charset=utf-8" };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
    headers["X-API-Key"] = apiKey;
  }
  return headers;
}

async function callSlackApiViaGateway(method, params = {}, tokenOverride, options = {}) {
  const runtimeGateway = getRuntimeGatewayConfig();
  if (!runtimeGateway.url) {
    throw new Error("Gateway URL is missing. Set SLACK_GATEWAY_URL to use gateway mode.");
  }

  const response = await fetch(`${runtimeGateway.url}/api/slack/call`, {
    method: "POST",
    headers: buildGatewayAuthHeaders(runtimeGateway.apiKey),
    body: JSON.stringify({
      method,
      params,
      token_override: tokenOverride || undefined,
      profile_selector: options.profileSelector || runtimeGateway.profile || undefined,
      preferred_token_type: options.preferredTokenType || process.env.SLACK_DEFAULT_TOKEN_TYPE || undefined,
    }),
  });

  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`Gateway returned non-JSON for ${method} (HTTP ${response.status}).`);
  }

  if (!response.ok) {
    const error = new Error(
      `Gateway HTTP ${response.status} for ${method}: ${body?.error || body?.message || "unknown_error"}`
    );
    error.http_status = response.status;
    error.slack_error = body?.slack_error || body?.error || "gateway_error";
    error.needed = body?.needed;
    error.provided = body?.provided;
    error.token_source = body?.token_source || "gateway";
    throw error;
  }

  if (!body?.ok) {
    const error = new Error(`Gateway call failed for ${method}: ${body?.error || "unknown_error"}`);
    error.slack_error = body?.slack_error || body?.error || "gateway_error";
    error.needed = body?.needed;
    error.provided = body?.provided;
    error.token_source = body?.token_source || "gateway";
    throw error;
  }

  return body.data;
}

async function slackHttpViaGateway(input) {
  const runtimeGateway = getRuntimeGatewayConfig();
  if (!runtimeGateway.url) {
    throw new Error("Gateway URL is missing. Set SLACK_GATEWAY_URL to use gateway mode.");
  }

  const response = await fetch(`${runtimeGateway.url}/api/slack/http`, {
    method: "POST",
    headers: buildGatewayAuthHeaders(runtimeGateway.apiKey),
    body: JSON.stringify({
      ...input,
      profile_selector: input.profile_selector || runtimeGateway.profile || undefined,
      preferred_token_type: input.preferred_token_type || process.env.SLACK_DEFAULT_TOKEN_TYPE || undefined,
    }),
  });

  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`Gateway returned non-JSON for HTTP proxy (HTTP ${response.status}).`);
  }

  if (!response.ok) {
    throw new Error(`Gateway HTTP ${response.status}: ${body?.error || "gateway_error"}`);
  }
  if (!body?.ok) {
    throw new Error(`Gateway HTTP proxy failed: ${body?.error || "gateway_error"}`);
  }
  return body.data;
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
  const runtimeGateway = getRuntimeGatewayConfig();
  if (runtimeGateway.url) {
    return callSlackApiViaGateway(method, params, tokenOverride, options);
  }

  const candidates = getSlackTokenCandidates(tokenOverride, options);
  if (candidates.length === 0) {
    throw new Error(
      "Slack token is missing. Set SLACK_BOT_TOKEN/SLACK_USER_TOKEN/SLACK_TOKEN or run `slack-max-api-mcp oauth login`."
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

function base64UrlEncodeString(value) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecodeToString(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Buffer.from(padded, "base64").toString("utf8");
}

function hmacSign(text, secret) {
  return crypto
    .createHmac("sha256", secret)
    .update(text)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function createSignedInviteToken(payload, secret) {
  const encodedPayload = base64UrlEncodeString(JSON.stringify(payload));
  const signature = hmacSign(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

function parseAndVerifyInviteToken(token, secret) {
  const [encodedPayload, signature] = String(token || "").split(".", 2);
  if (!encodedPayload || !signature) {
    throw new Error("Invalid invite token format.");
  }
  const expected = hmacSign(encodedPayload, secret);
  const expectedBuf = Buffer.from(expected, "utf8");
  const sigBuf = Buffer.from(signature, "utf8");
  if (expectedBuf.length !== sigBuf.length || !crypto.timingSafeEqual(expectedBuf, sigBuf)) {
    throw new Error("Invalid invite token signature.");
  }
  let payload;
  try {
    payload = JSON.parse(base64UrlDecodeToString(encodedPayload));
  } catch {
    throw new Error("Invalid invite token payload.");
  }
  if (typeof payload !== "object" || !payload) {
    throw new Error("Invalid invite token payload object.");
  }
  if (!payload.exp || Number(payload.exp) < Date.now()) {
    throw new Error("Invite token expired.");
  }
  return payload;
}

function requireGatewayInviteSecret() {
  if (!GATEWAY_SHARED_SECRET) {
    throw new Error("Set SLACK_GATEWAY_SHARED_SECRET before using gateway invite/onboarding.");
  }
  return GATEWAY_SHARED_SECRET;
}

function isInteractiveTerminal() {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

function hasAnyLocalAuthMaterial() {
  const runtimeGateway = getRuntimeGatewayConfig();
  if (runtimeGateway.url) return true;
  const tokenCandidates = getSlackTokenCandidates(undefined, {
    includeEnvTokens: true,
    includeTokenStore: true,
  });
  return tokenCandidates.length > 0;
}

async function runAutoOnboardingIfPossible() {
  if (!AUTO_ONBOARD_ENABLED) return false;
  if (!isInteractiveTerminal()) return false;
  if (hasAnyLocalAuthMaterial()) return false;

  if (AUTO_ONBOARD_URL) {
    const opened = openExternalUrl(AUTO_ONBOARD_URL);
    if (!opened) {
      console.log(`[auto-onboard] Open this URL in browser:\n${AUTO_ONBOARD_URL}`);
    } else {
      console.log("[auto-onboard] Browser opened for onboarding.");
    }
    return true;
  }

  if (AUTO_ONBOARD_GATEWAY && AUTO_ONBOARD_TOKEN) {
    const args = ["--gateway", AUTO_ONBOARD_GATEWAY, "--token", AUTO_ONBOARD_TOKEN];
    if (AUTO_ONBOARD_PROFILE) args.push("--profile", AUTO_ONBOARD_PROFILE);
    await runOnboardStart(args);
    return true;
  }

  if (AUTO_ONBOARD_GATEWAY) {
    const args = ["--gateway", AUTO_ONBOARD_GATEWAY];
    if (AUTO_ONBOARD_PROFILE) {
      args.push("--profile", AUTO_ONBOARD_PROFILE);
    } else if (AUTO_ONBOARD_PROFILE_PREFIX) {
      args.push("--profile", createAutoOnboardProfileName(AUTO_ONBOARD_PROFILE_PREFIX));
    }
    await runOnboardStart(args);
    return true;
  }

  return false;
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

function printOnboardHelp() {
  const lines = [
    "Slack Max onboarding helper",
    "",
    "Usage:",
    "  slack-max-api-mcp onboard run --gateway https://gateway.example.com [--token <invite_token>]",
    "    [--profile NAME] [--team T123] [--scope a,b] [--user-scope c,d]",
    "  slack-max-api-mcp onboard quick --gateway https://gateway.example.com",
    "  slack-max-api-mcp onboard help",
    "",
    "If --token is omitted, it uses gateway public onboarding endpoint (/onboard/bootstrap).",
    "This command writes local client config and opens the Slack OAuth approval page automatically.",
  ];
  console.log(lines.join("\n"));
}

async function runOnboardStart(args) {
  const { options } = parseCliArgs(args);
  const gateway = String(options.gateway || options.url || "").replace(/\/+$/, "");
  const token = String(options.token || "");
  if (!gateway) {
    throw new Error(
      "Usage: slack-max-api-mcp onboard run --gateway <url> [--token <invite_token>] [--profile <name>]"
    );
  }

  const requestedProfile =
    String(options.profile || "").trim() || createAutoOnboardProfileName(AUTO_ONBOARD_PROFILE_PREFIX);
  const requestedTeam = String(options.team || "").trim();
  const requestedScope = parseScopeList(options.scope || "").join(",");
  const requestedUserScope = parseScopeList(options["user-scope"] || options.user_scope || "").join(",");

  const onboardingUrl = token
    ? `${gateway}/onboard/resolve?token=${encodeURIComponent(token)}`
    : (() => {
        const params = new URLSearchParams();
        if (requestedProfile) params.set("profile", requestedProfile);
        if (requestedTeam) params.set("team", requestedTeam);
        if (requestedScope) params.set("scope", requestedScope);
        if (requestedUserScope) params.set("user_scope", requestedUserScope);
        const query = params.toString();
        return `${gateway}/onboard/bootstrap${query ? `?${query}` : ""}`;
      })();

  const response = await fetch(onboardingUrl, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Onboarding response was non-JSON (HTTP ${response.status}).`);
  }

  if (!response.ok || !data?.ok) {
    if (!token && response.status === 404) {
      throw new Error("Onboarding failed: public onboarding is disabled on gateway (enable SLACK_GATEWAY_PUBLIC_ONBOARD=true).");
    }
    throw new Error(`Onboarding failed: ${data?.error || `http_${response.status}`}`);
  }

  const resolvedGatewayUrl = String(data.gateway_url || gateway).replace(/\/+$/, "");
  const resolvedApiKey = String(data.gateway_api_key || "");
  const profile = String(data.profile || requestedProfile || "");
  const oauthStartUrl = String(data.oauth_start_url || "");

  if (data.requires_gateway_api_key && !resolvedApiKey) {
    throw new Error(
      "Gateway requires API key but onboarding response did not provide one. Enable public gateway access or set SLACK_GATEWAY_PUBLIC_ONBOARD_API_KEY."
    );
  }

  saveClientConfig({
    version: 1,
    gateway_url: resolvedGatewayUrl,
    gateway_api_key: resolvedApiKey,
    profile,
    updated_at: new Date().toISOString(),
  });

  if (oauthStartUrl) {
    const opened = openExternalUrl(oauthStartUrl);
    if (!opened) {
      console.log(`[onboard] Open this URL in browser:\n${oauthStartUrl}`);
    }
  }

  console.log(`[onboard] client config saved: ${CLIENT_CONFIG_PATH}`);
  console.log(`[onboard] gateway: ${resolvedGatewayUrl}`);
  if (profile) console.log(`[onboard] profile: ${profile}`);
  if (data.mode === "public_onboard") {
    console.log("[onboard] mode: public_onboard (tokenless)");
  }
  console.log("[onboard] Next: approve in browser, then use Codex MCP as usual.");
}

async function runOnboardCli(args) {
  const subcommand = (args[0] || "help").toLowerCase();
  const rest = args.slice(1);
  if (subcommand === "help" || subcommand === "--help" || subcommand === "-h") {
    printOnboardHelp();
    return;
  }
  if (subcommand === "run" || subcommand === "start" || subcommand === "quick") {
    await runOnboardStart(rest);
    return;
  }
  throw new Error(`Unknown onboard command: ${subcommand}`);
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload, null, 2));
}

async function readRequestText(req, maxBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error("Request body too large."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", (error) => reject(error));
  });
}

async function readRequestJson(req, maxBytes) {
  const text = await readRequestText(req, maxBytes);
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Invalid JSON body.");
  }
}

function getRequestApiKey(req) {
  const authHeader = req.headers.authorization || "";
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }
  const xApiKey = req.headers["x-api-key"];
  return typeof xApiKey === "string" ? xApiKey.trim() : "";
}

function isGatewayAuthorized(req) {
  if (GATEWAY_ALLOW_PUBLIC) return true;
  const allowedKeys = [GATEWAY_SHARED_SECRET, GATEWAY_CLIENT_API_KEY].filter(Boolean);
  if (allowedKeys.length === 0) return false;
  const provided = getRequestApiKey(req);
  return Boolean(provided && allowedKeys.includes(provided));
}

function requireGatewayClientCredentials() {
  const clientId = process.env.SLACK_CLIENT_ID || "";
  const clientSecret = process.env.SLACK_CLIENT_SECRET || "";
  if (!clientId || !clientSecret) {
    throw new Error("Gateway OAuth requires SLACK_CLIENT_ID and SLACK_CLIENT_SECRET on the gateway server.");
  }
  return { clientId, clientSecret };
}

function profileSummariesFromStore(store) {
  const summaries = [];
  for (const [key, profile] of Object.entries(store.profiles || {})) {
    summaries.push({
      key,
      profile_name: profile.profile_name || "",
      team_id: profile.team_id || "",
      team_name: profile.team_name || "",
      authed_user_id: profile.authed_user_id || "",
      has_bot_token: Boolean(profile.bot_token),
      has_user_token: Boolean(profile.user_token),
      updated_at: profile.updated_at || null,
      is_default: store.default_profile === key,
    });
  }
  return summaries;
}

function buildGatewayRedirectUri() {
  const url = new URL(OAUTH_CALLBACK_PATH, `${GATEWAY_PUBLIC_BASE_URL.replace(/\/+$/, "")}/`);
  return url.toString();
}

function parseScopesFromQuery(searchParams, key, fallback) {
  const value = searchParams.get(key);
  return parseScopeList(value || fallback);
}

function buildOauthStartUrlFromInvitePayload(gatewayBaseUrl, payload) {
  const params = new URLSearchParams();
  if (payload.profile) params.set("profile", payload.profile);
  if (payload.team) params.set("team", payload.team);
  if (payload.scope) params.set("scope", payload.scope);
  if (payload.user_scope) params.set("user_scope", payload.user_scope);
  return `${gatewayBaseUrl.replace(/\/+$/, "")}/oauth/start${params.toString() ? `?${params.toString()}` : ""}`;
}

function buildPublicOnboardPayload(gatewayBaseUrl, params = {}) {
  const profile = String(params.profile || "").trim() || createAutoOnboardProfileName(GATEWAY_PUBLIC_ONBOARD_PROFILE_PREFIX);
  const team = String(params.team || process.env.SLACK_OAUTH_TEAM_ID || "").trim();
  const scope = parseScopeList(params.scope || DEFAULT_OAUTH_BOT_SCOPES).join(",");
  const userScope = parseScopeList(params.user_scope || DEFAULT_OAUTH_USER_SCOPES).join(",");
  const payload = {
    gateway_url: gatewayBaseUrl,
    gateway_api_key: "",
    profile,
    team,
    scope,
    user_scope: userScope,
  };
  if (GATEWAY_ALLOW_PUBLIC) {
    payload.gateway_api_key = "";
  } else if (GATEWAY_PUBLIC_ONBOARD_API_KEY) {
    payload.gateway_api_key = GATEWAY_PUBLIC_ONBOARD_API_KEY;
  } else if (GATEWAY_PUBLIC_ONBOARD_EXPOSE_API_KEY) {
    payload.gateway_api_key = GATEWAY_CLIENT_API_KEY || "";
  }
  const oauthStartUrl = buildOauthStartUrlFromInvitePayload(gatewayBaseUrl, payload);
  return {
    ok: true,
    mode: "public_onboard",
    gateway_url: payload.gateway_url,
    gateway_api_key: payload.gateway_api_key,
    profile: payload.profile,
    oauth_start_url: oauthStartUrl,
    requires_gateway_api_key: !GATEWAY_ALLOW_PUBLIC,
  };
}

function buildOnboardPowerShellScript({ gatewayBaseUrl, token, profile, team, scope, userScope }) {
  const safeGateway = String(gatewayBaseUrl || "").replace(/'/g, "''");
  const safeToken = String(token || "").replace(/'/g, "''");
  const safeProfile = String(profile || "").replace(/'/g, "''");
  const safeTeam = String(team || "").replace(/'/g, "''");
  const safeScope = String(scope || "").replace(/'/g, "''");
  const safeUserScope = String(userScope || "").replace(/'/g, "''");
  const safePackageSpec = String(ONBOARD_PACKAGE_SPEC || "").replace(/'/g, "''");
  const onboardCommandParts = [`npx -y '${safePackageSpec}' onboard run --gateway '${safeGateway}'`];
  if (safeToken) onboardCommandParts.push(`--token '${safeToken}'`);
  if (safeProfile) onboardCommandParts.push(`--profile '${safeProfile}'`);
  if (safeTeam) onboardCommandParts.push(`--team '${safeTeam}'`);
  if (safeScope) onboardCommandParts.push(`--scope '${safeScope}'`);
  if (safeUserScope) onboardCommandParts.push(`--user-scope '${safeUserScope}'`);

  const lines = [
    "$ErrorActionPreference = 'Stop'",
    "if (-not (Get-Command npx -ErrorAction SilentlyContinue)) { throw 'npx is required. Install Node.js first.' }",
  ];
  if (ONBOARD_SKIP_TLS_VERIFY) {
    lines.push("$env:NODE_TLS_REJECT_UNAUTHORIZED='0'");
  }
  lines.push(onboardCommandParts.join(" "));
  if (ONBOARD_SKIP_TLS_VERIFY) {
    lines.push("Remove-Item Env:NODE_TLS_REJECT_UNAUTHORIZED -ErrorAction SilentlyContinue");
  }
  return lines.join("\r\n");
}

function createGatewayInviteTokenFromOptions(options = {}) {
  const secret = requireGatewayInviteSecret();
  const profile = String(options.profile || "").trim();
  const team = String(options.team || "").trim();
  const scope = parseScopeList(options.scope || DEFAULT_OAUTH_BOT_SCOPES).join(",");
  const userScope = parseScopeList(options["user-scope"] || options.user_scope || DEFAULT_OAUTH_USER_SCOPES).join(
    ","
  );
  const ttlDays = Math.max(1, Number(options.days || INVITE_TOKEN_DEFAULT_DAYS));
  const gatewayUrl = String(options.gateway || options.gateway_url || GATEWAY_PUBLIC_BASE_URL).replace(/\/+$/, "");

  const payload = {
    v: 1,
    exp: Date.now() + ttlDays * 24 * 60 * 60 * 1000,
    gateway_url: gatewayUrl,
    gateway_api_key: String(options["client-api-key"] || options.client_api_key || GATEWAY_CLIENT_API_KEY || ""),
    profile,
    team,
    scope,
    user_scope: userScope,
  };
  const token = createSignedInviteToken(payload, secret);
  return { token, payload };
}

async function proxySlackHttpRequest(payload) {
  const tokenCandidate = requireSlackTokenCandidate(payload.token_override, {
    profileSelector: payload.profile_selector || process.env.SLACK_PROFILE || GATEWAY_PROFILE || undefined,
    preferredTokenType: payload.preferred_token_type || process.env.SLACK_DEFAULT_TOKEN_TYPE || undefined,
  });

  const method = payload.http_method || "GET";
  const endpoint = new URL(payload.url);
  for (const [k, v] of Object.entries(toRecordObject(payload.query))) {
    if (v === undefined || v === null) continue;
    endpoint.searchParams.set(k, String(v));
  }

  const reqHeaders = {
    Authorization: `Bearer ${tokenCandidate.token}`,
    ...toRecordObject(payload.headers),
  };

  let body;
  const formBody = toRecordObject(payload.form_body);
  const jsonBody = toRecordObject(payload.json_body);
  if (Object.keys(formBody).length > 0) {
    reqHeaders["Content-Type"] = "application/x-www-form-urlencoded; charset=utf-8";
    body = toUrlEncodedBody(formBody);
  } else if (Object.keys(jsonBody).length > 0) {
    reqHeaders["Content-Type"] = "application/json; charset=utf-8";
    body = JSON.stringify(jsonBody);
  }

  const res = await fetch(endpoint.toString(), { method, headers: reqHeaders, body });
  const text = await res.text();
  let parsedBody = text;
  try {
    parsedBody = JSON.parse(text);
  } catch {
    // keep text
  }

  return {
    url: endpoint.toString(),
    status: res.status,
    ok: res.ok,
    headers: Object.fromEntries(res.headers.entries()),
    body: parsedBody,
    token_source: tokenCandidate.source,
  };
}

async function startGatewayServer() {
  const pendingStates = new Map();
  const callbackPath = OAUTH_CALLBACK_PATH;
  const redirectUri = buildGatewayRedirectUri();
  const gatewayBaseUrl = `${GATEWAY_PUBLIC_BASE_URL.replace(/\/+$/, "")}`;

  const server = http.createServer(async (req, res) => {
    try {
      const method = req.method || "GET";
      const requestUrl = new URL(req.url || "/", `http://${GATEWAY_HOST}:${GATEWAY_PORT}`);

      if (method === "GET" && requestUrl.pathname === "/health") {
        sendJson(res, 200, {
          ok: true,
          service: SERVER_NAME,
          mode: "gateway",
          token_store_path: TOKEN_STORE_PATH,
          client_config_path: CLIENT_CONFIG_PATH,
          callback_url: redirectUri,
        });
        return;
      }

      if (method === "GET" && requestUrl.pathname === "/onboard.ps1") {
        const token = requestUrl.searchParams.get("token") || "";
        let script = "";
        if (token) {
          const secret = requireGatewayInviteSecret();
          const payload = parseAndVerifyInviteToken(token, secret);
          script = buildOnboardPowerShellScript({
            gatewayBaseUrl: payload.gateway_url || gatewayBaseUrl,
            token,
          });
        } else {
          if (!GATEWAY_PUBLIC_ONBOARD_ENABLED) {
            sendJson(res, 404, { ok: false, error: "public_onboard_disabled" });
            return;
          }
          const profile =
            requestUrl.searchParams.get("profile") ||
            createAutoOnboardProfileName(GATEWAY_PUBLIC_ONBOARD_PROFILE_PREFIX);
          const team = requestUrl.searchParams.get("team") || "";
          const scope = requestUrl.searchParams.get("scope") || "";
          const userScope = requestUrl.searchParams.get("user_scope") || "";
          script = buildOnboardPowerShellScript({
            gatewayBaseUrl,
            profile,
            team,
            scope,
            userScope,
          });
        }
        res.writeHead(200, {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
        });
        res.end(script);
        return;
      }

      if (method === "GET" && requestUrl.pathname === "/onboard/bootstrap") {
        if (!GATEWAY_PUBLIC_ONBOARD_ENABLED) {
          sendJson(res, 404, { ok: false, error: "public_onboard_disabled" });
          return;
        }
        const payload = buildPublicOnboardPayload(gatewayBaseUrl, {
          profile: requestUrl.searchParams.get("profile") || "",
          team: requestUrl.searchParams.get("team") || "",
          scope: requestUrl.searchParams.get("scope") || "",
          user_scope: requestUrl.searchParams.get("user_scope") || "",
        });
        sendJson(res, 200, payload);
        return;
      }

      if (method === "GET" && requestUrl.pathname === "/onboard/resolve") {
        const token = requestUrl.searchParams.get("token") || "";
        const secret = requireGatewayInviteSecret();
        const payload = parseAndVerifyInviteToken(token, secret);
        const oauthStartUrl = buildOauthStartUrlFromInvitePayload(gatewayBaseUrl, payload);
        sendJson(res, 200, {
          ok: true,
          mode: "invite_token",
          gateway_url: payload.gateway_url || gatewayBaseUrl,
          gateway_api_key: payload.gateway_api_key || "",
          profile: payload.profile || "",
          oauth_start_url: oauthStartUrl,
          expires_at: new Date(Number(payload.exp)).toISOString(),
        });
        return;
      }

      if (method === "GET" && requestUrl.pathname === "/oauth/start") {
        const { clientId } = requireGatewayClientCredentials();
        const profileName = requestUrl.searchParams.get("profile") || "";
        const teamId = requestUrl.searchParams.get("team") || process.env.SLACK_OAUTH_TEAM_ID || "";
        const botScopes = parseScopesFromQuery(requestUrl.searchParams, "scope", DEFAULT_OAUTH_BOT_SCOPES);
        const userScopes = parseScopesFromQuery(
          requestUrl.searchParams,
          "user_scope",
          DEFAULT_OAUTH_USER_SCOPES
        );

        if (botScopes.length === 0 && userScopes.length === 0) {
          sendJson(res, 400, { ok: false, error: "missing_scope" });
          return;
        }

        const state = crypto.randomBytes(24).toString("hex");
        pendingStates.set(state, {
          created_at: Date.now(),
          profile_name: profileName,
          team_id: teamId,
          bot_scopes: botScopes,
          user_scopes: userScopes,
        });

        const authorizeUrl = buildOauthAuthorizeUrl({
          clientId,
          state,
          redirectUri,
          botScopes,
          userScopes,
          teamId,
        });

        res.writeHead(302, { Location: authorizeUrl });
        res.end();
        return;
      }

      if (method === "GET" && requestUrl.pathname === callbackPath) {
        const { clientId, clientSecret } = requireGatewayClientCredentials();
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

        const pending = pendingStates.get(state);
        pendingStates.delete(state);
        if (!pending) {
          sendText(res, 400, "Invalid or expired OAuth state.");
          return;
        }
        if (Date.now() - pending.created_at > GATEWAY_STATE_TTL_MS) {
          sendText(res, 400, "Expired OAuth state.");
          return;
        }

        const oauthResponse = await exchangeOauthCode({ clientId, clientSecret, code, redirectUri });
        const { key, profile } = upsertOauthProfile(oauthResponse, pending.profile_name);
        sendText(
          res,
          200,
          [
            "Slack OAuth authorization completed.",
            `Saved profile: ${profile.profile_name || key}`,
            `Profile key: ${key}`,
            "You can close this tab.",
          ].join("\n")
        );
        return;
      }

      if (method === "GET" && requestUrl.pathname === "/oauth/link") {
        const params = new URLSearchParams();
        const profile = requestUrl.searchParams.get("profile") || "";
        const team = requestUrl.searchParams.get("team") || "";
        const scope = requestUrl.searchParams.get("scope") || "";
        const userScope = requestUrl.searchParams.get("user_scope") || "";
        if (profile) params.set("profile", profile);
        if (team) params.set("team", team);
        if (scope) params.set("scope", scope);
        if (userScope) params.set("user_scope", userScope);
        sendJson(res, 200, {
          ok: true,
          url: `${gatewayBaseUrl}/oauth/start${params.toString() ? `?${params.toString()}` : ""}`,
        });
        return;
      }

      if (method === "GET" && requestUrl.pathname === "/profiles") {
        if (!isGatewayAuthorized(req)) {
          sendJson(res, 401, { ok: false, error: "unauthorized" });
          return;
        }
        const tokenStore = loadTokenStore();
        sendJson(res, 200, {
          ok: true,
          default_profile: tokenStore.default_profile,
          profiles: profileSummariesFromStore(tokenStore),
        });
        return;
      }

      if (method === "POST" && requestUrl.pathname === "/api/slack/call") {
        if (!isGatewayAuthorized(req)) {
          sendJson(res, 401, { ok: false, error: "unauthorized" });
          return;
        }

        const payload = await readRequestJson(req, 1024 * 1024);
        const methodName = payload.method;
        if (!methodName || typeof methodName !== "string") {
          sendJson(res, 400, { ok: false, error: "missing_method" });
          return;
        }

        const candidates = getSlackTokenCandidates(payload.token_override, {
          profileSelector:
            payload.profile_selector || process.env.SLACK_PROFILE || GATEWAY_PROFILE || undefined,
          preferredTokenType:
            payload.preferred_token_type || process.env.SLACK_DEFAULT_TOKEN_TYPE || undefined,
        });
        if (candidates.length === 0) {
          sendJson(res, 400, { ok: false, error: "missing_token" });
          return;
        }

        const data = await callSlackApiWithCandidates(methodName, payload.params || {}, candidates);
        sendJson(res, 200, { ok: true, data });
        return;
      }

      if (method === "POST" && requestUrl.pathname === "/api/slack/http") {
        if (!isGatewayAuthorized(req)) {
          sendJson(res, 401, { ok: false, error: "unauthorized" });
          return;
        }

        const payload = await readRequestJson(req, 1024 * 1024);
        if (!payload.url || typeof payload.url !== "string") {
          sendJson(res, 400, { ok: false, error: "missing_url" });
          return;
        }

        const data = await proxySlackHttpRequest(payload);
        sendJson(res, 200, { ok: true, data });
        return;
      }

      sendJson(res, 404, { ok: false, error: "not_found" });
    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        slack_error: error?.slack_error || null,
        needed: error?.needed || null,
        provided: error?.provided || null,
        token_source: error?.token_source || null,
      });
    } finally {
      for (const [state, value] of pendingStates.entries()) {
        if (Date.now() - value.created_at > GATEWAY_STATE_TTL_MS) {
          pendingStates.delete(state);
        }
      }
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(GATEWAY_PORT, GATEWAY_HOST, resolve);
  });

  console.error(
    `[${SERVER_NAME}] gateway listening at http://${GATEWAY_HOST}:${GATEWAY_PORT} | public_base=${gatewayBaseUrl}`
  );
  console.error(`[${SERVER_NAME}] oauth start URL: ${gatewayBaseUrl}/oauth/start`);
  console.error(`[${SERVER_NAME}] profile list URL: ${gatewayBaseUrl}/profiles`);
  if (GATEWAY_PUBLIC_ONBOARD_ENABLED) {
    console.error(`[${SERVER_NAME}] public onboard URL: ${gatewayBaseUrl}/onboard/bootstrap`);
  }
}

function printGatewayHelp() {
  const lines = [
    "Slack Max Gateway helper",
    "",
    "Usage:",
    "  slack-max-api-mcp gateway start",
    "  slack-max-api-mcp gateway invite --profile woobin --team T123",
    "  # tokenless onboarding endpoint (when enabled):",
    "  #   https://gateway.example.com/onboard/bootstrap",
    "  slack-max-api-mcp gateway help",
    "",
    "Gateway env vars (server-side):",
    "  SLACK_CLIENT_ID, SLACK_CLIENT_SECRET",
    "  SLACK_GATEWAY_HOST, SLACK_GATEWAY_PORT, SLACK_GATEWAY_PUBLIC_BASE_URL",
    "  SLACK_GATEWAY_SHARED_SECRET (recommended)",
    "  SLACK_GATEWAY_CLIENT_API_KEY (optional, defaults to shared secret)",
    "  SLACK_GATEWAY_PUBLIC_ONBOARD=true  # allow tokenless onboarding endpoint",
    "  SLACK_GATEWAY_PUBLIC_ONBOARD_API_KEY=<client key>  # optional, used when gateway is not fully public",
    "  SLACK_GATEWAY_PUBLIC_ONBOARD_EXPOSE_API_KEY=true   # fallback: expose client key as-is",
    "  SLACK_OAUTH_BOT_SCOPES, SLACK_OAUTH_USER_SCOPES",
    "",
    "Client env vars (mcp caller-side):",
    "  SLACK_GATEWAY_URL, SLACK_GATEWAY_API_KEY",
    "  SLACK_PROFILE or SLACK_GATEWAY_PROFILE",
  ];
  console.log(lines.join("\n"));
}

function runGatewayInvite(args) {
  const { options } = parseCliArgs(args);
  const { token, payload } = createGatewayInviteTokenFromOptions(options);
  const gatewayBaseUrl = String(payload.gateway_url || GATEWAY_PUBLIC_BASE_URL).replace(/\/+$/, "");
  const onboardScriptUrl = `${gatewayBaseUrl}/onboard.ps1?token=${encodeURIComponent(token)}`;
  const oauthStartUrl = buildOauthStartUrlFromInvitePayload(gatewayBaseUrl, payload);
  const command = `powershell -ExecutionPolicy Bypass -Command "irm '${onboardScriptUrl}' | iex"`;
  const commandCurlFallback = [
    `$tmp = Join-Path $env:TEMP 'slack-onboard.ps1'`,
    `curl.exe -k -sS '${onboardScriptUrl}' -o $tmp`,
    `powershell -ExecutionPolicy Bypass -File $tmp`,
    `Remove-Item $tmp -Force`,
  ].join("; ");

  console.log("[gateway] invite token created");
  console.log(`[gateway] expires_at: ${new Date(Number(payload.exp)).toISOString()}`);
  console.log(`[gateway] onboarding_script: ${onboardScriptUrl}`);
  console.log(`[gateway] oauth_start_url: ${oauthStartUrl}`);
  console.log("[gateway] one-click command for team member:");
  console.log(command);
  console.log("[gateway] fallback command (self-signed TLS):");
  console.log(commandCurlFallback);
}

async function runGatewayCli(args) {
  const subcommand = (args[0] || "help").toLowerCase();
  if (subcommand === "help" || subcommand === "--help" || subcommand === "-h") {
    printGatewayHelp();
    return;
  }
  if (subcommand === "start") {
    await startGatewayServer();
    return;
  }
  if (subcommand === "invite") {
    runGatewayInvite(args.slice(1));
    return;
  }
  throw new Error(`Unknown gateway command: ${subcommand}`);
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
        const runtimeGateway = getRuntimeGatewayConfig();
        if (runtimeGateway.url) {
          return slackHttpViaGateway({
            url,
            http_method,
            query,
            json_body,
            form_body,
            headers,
            token_override,
          });
        }

        const tokenCandidate = requireSlackTokenCandidate(token_override);
        const method = http_method || "GET";

        const endpoint = new URL(url);
        for (const [k, v] of Object.entries(toRecordObject(query))) {
          if (v === undefined || v === null) continue;
          endpoint.searchParams.set(k, String(v));
        }

        const reqHeaders = {
          Authorization: `Bearer ${tokenCandidate.token}`,
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
        const clientConfig = loadClientConfig();
        const runtimeGateway = getRuntimeGatewayConfig();
        return {
          catalog_path: CATALOG_PATH,
          method_tools_enabled: ENABLE_METHOD_TOOLS,
          max_method_tools: MAX_METHOD_TOOLS,
          methods_in_catalog: methods.length,
          method_tools_registered: registered,
          method_tool_prefix: METHOD_TOOL_PREFIX,
          token_store_path: TOKEN_STORE_PATH,
          client_config_path: CLIENT_CONFIG_PATH,
          active_profile: activeProfile
            ? {
                key: activeProfile.key,
                profile_name: activeProfile.profile?.profile_name || "",
                team_id: activeProfile.profile?.team_id || "",
              }
            : null,
          client_profile: clientConfig.profile || "",
          env_tokens_present: {
            bot: Boolean(process.env.SLACK_BOT_TOKEN),
            user: Boolean(process.env.SLACK_USER_TOKEN),
            generic: Boolean(process.env.SLACK_TOKEN),
          },
          gateway_mode: Boolean(runtimeGateway.url),
          gateway_url: runtimeGateway.url || null,
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

  registerCoreTools(server);
  const catalog = loadCatalog();
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
    `[${SERVER_NAME}] connected via stdio | catalog_methods=${catalogCount} | method_tools_registered=${methodStats.registered}`
  );
}

async function runEntryPoint() {
  const [firstArg, ...rest] = process.argv.slice(2);
  const command = (firstArg || "").toLowerCase();
  if (command === "oauth") {
    await runOauthCli(rest);
    return;
  }
  if (command === "gateway") {
    await runGatewayCli(rest);
    return;
  }
  if (command === "onboard") {
    await runOnboardCli(rest);
    return;
  }
  if (!command) {
    const onboarded = await runAutoOnboardingIfPossible();
    if (onboarded) return;
  }
  await startMcpServer();
}

runEntryPoint().catch((error) => {
  console.error(`[${SERVER_NAME}] fatal error:`, error);
  process.exit(1);
});
