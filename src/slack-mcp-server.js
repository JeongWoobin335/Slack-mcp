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
const PACKAGE_ROOT = path.resolve(__dirname, "..");

const SLACK_API_BASE_URL = process.env.SLACK_API_BASE_URL || "https://slack.com/api";

const CATALOG_PATH =
  process.env.SLACK_CATALOG_PATH || path.join(process.cwd(), "data", "slack-catalog.json");
const OPERATIONS_CONFIG_PATH =
  process.env.SLACK_OPERATIONS_CONFIG_PATH || path.join(PACKAGE_ROOT, "config", "operations.json");
const OPERATIONS_STATE_PATH =
  process.env.SLACK_OPERATIONS_STATE_PATH ||
  path.join(os.homedir(), ".slack-max-api-mcp", "operations-state.json");
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
  TOOL_EXPOSURE_MODE === "developer"
);
const EXPOSE_GATEWAY_TOOLS = TOOL_EXPOSURE_MODE === "developer";
const EXPOSE_CORE_TOOLS = TOOL_EXPOSURE_MODE === "legacy" || SMART_COMPAT_CORE_TOOLS;
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
const GATEWAY_COMPAT_HOST = "43.202.54.65.sslip.io";
const GATEWAY_URL_ENV = process.env.SLACK_GATEWAY_URL || "";
const GATEWAY_API_KEY = process.env.SLACK_GATEWAY_API_KEY || "";
const GATEWAY_PROFILE = process.env.SLACK_GATEWAY_PROFILE || "";
const INSECURE_TLS = parseBooleanEnv(process.env.SLACK_INSECURE_TLS, false);
const GATEWAY_SKIP_TLS_VERIFY = parseBooleanEnv(
  process.env.SLACK_GATEWAY_SKIP_TLS_VERIFY,
  INSECURE_TLS
);
const ONBOARD_SKIP_TLS_VERIFY = parseBooleanEnv(
  process.env.SLACK_ONBOARD_SKIP_TLS_VERIFY,
  INSECURE_TLS
);
const ENABLE_AUDIT_LOG = parseBooleanEnv(process.env.SLACK_ENABLE_AUDIT_LOG, true);
const AUDIT_LOG_PATH =
  process.env.SLACK_AUDIT_LOG_PATH ||
  path.join(os.homedir(), ".slack-max-api-mcp", "audit.log");
const METHOD_ALLOWLIST = new Set(parseScopeList(process.env.SLACK_METHOD_ALLOWLIST).map((v) => v.toLowerCase()));
const METHOD_DENYLIST = new Set(parseScopeList(process.env.SLACK_METHOD_DENYLIST).map((v) => v.toLowerCase()));
const METHOD_ALLOW_PREFIXES = parseScopeList(process.env.SLACK_METHOD_ALLOW_PREFIXES).map((v) =>
  v.toLowerCase()
);
const METHOD_DENY_PREFIXES = parseScopeList(process.env.SLACK_METHOD_DENY_PREFIXES).map((v) =>
  v.toLowerCase()
);
const OPERATIONS_CONFIG = loadOperationsConfig();
const OPS_PLAYBOOKS = buildOperationsPlaybooks(OPERATIONS_CONFIG);
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
  const normalized = String(rawValue || "operations").trim().toLowerCase();
  if (normalized === "legacy") return "legacy";
  if (normalized === "developer" || normalized === "smart") return "developer";
  return "operations";
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

function readJsonFileSafely(filePath, fallbackValue) {
  if (!fs.existsSync(filePath)) return fallbackValue;

  try {
    const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
    return JSON.parse(raw);
  } catch {
    return fallbackValue;
  }
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

function deepMergeObjects(baseValue, overrideValue) {
  if (Array.isArray(overrideValue)) {
    return overrideValue.slice();
  }

  if (!overrideValue || typeof overrideValue !== "object") {
    return overrideValue === undefined ? baseValue : overrideValue;
  }

  const baseObject =
    baseValue && typeof baseValue === "object" && !Array.isArray(baseValue) ? baseValue : {};
  const merged = { ...baseObject };

  for (const [key, value] of Object.entries(overrideValue)) {
    merged[key] = deepMergeObjects(baseObject[key], value);
  }

  return merged;
}

function defaultOperationsConfig() {
  return {
    playbooks: {
      incident_open: {
        summary: "Post an incident opening message with a standard operations template.",
        required_inputs: ["channel", "title"],
        supports_dry_run: true,
      },
      support_digest: {
        summary: "Build and optionally publish a support digest from channel activity.",
        required_inputs: ["channels"],
        supports_dry_run: true,
      },
      release_broadcast: {
        summary: "Broadcast a release announcement to multiple channels.",
        required_inputs: ["channels", "title", "summary"],
        supports_dry_run: true,
      },
    },
    incidents: {
      default_channel: "",
      default_owner: "TBD",
      default_severity: "sev2",
      update_interval_minutes: 15,
      open_template: [
        ":rotating_light: Incident Open - {{title}}",
        "Severity: {{severity_upper}}",
        "Owner: {{owner}}",
        "Summary: {{summary}}",
        "{{details_line}}",
        "Next update: {{next_update_text}}",
      ],
      update_template: [
        ":information_source: Incident Update - {{title}}",
        "Status: {{status_upper}}",
        "Severity: {{severity_upper}}",
        "Owner: {{owner}}",
        "Summary: {{summary}}",
        "{{details_line}}",
        "Next update: {{next_update_text}}",
      ],
      close_template: [
        ":white_check_mark: Incident Resolved - {{title}}",
        "Severity: {{severity_upper}}",
        "Owner: {{owner}}",
        "Resolution: {{resolution}}",
        "{{details_line}}",
      ],
    },
    support_digest: {
      default_lookback_hours: 24,
      default_sla_minutes: 60,
      default_max_threads: 10,
      header_template: "Support Digest ({{lookback_hours}}h)",
      sla_template: "SLA threshold: {{sla_minutes}}m",
    },
    broadcasts: {
      default_template: "release_default",
      default_mrkdwn: true,
      templates: {
        release_default: [
          ":rocket: Release - {{title}}",
          "{{summary}}",
          "{{details}}",
        ],
      },
    },
    followups: {
      default_sla_minutes: 60,
      default_lookback_hours: 24,
      default_max_threads_per_channel: 20,
      default_max_messages: 30,
      suppress_hours: 6,
      reminder_template:
        "Friendly reminder: this thread appears to be pending for more than {{sla_minutes}} minutes. Please provide an update.",
    },
  };
}

function loadOperationsConfig() {
  const defaults = defaultOperationsConfig();
  if (!fs.existsSync(OPERATIONS_CONFIG_PATH)) {
    return defaults;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(OPERATIONS_CONFIG_PATH, "utf8"));
    return deepMergeObjects(defaults, parsed);
  } catch (error) {
    console.error(
      `[${SERVER_NAME}] failed to load operations config at ${OPERATIONS_CONFIG_PATH}: ${error}`
    );
    return defaults;
  }
}

function buildOperationsPlaybooks(config) {
  const playbooks =
    config && config.playbooks && typeof config.playbooks === "object" ? config.playbooks : {};

  return Object.entries(playbooks).map(([id, meta]) => ({
    id,
    summary: meta?.summary || "",
    required_inputs: Array.isArray(meta?.required_inputs) ? meta.required_inputs : [],
    supports_dry_run: meta?.supports_dry_run !== false,
  }));
}

function normalizeObjectMap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function emptyOperationsState() {
  return {
    version: 1,
    updated_at: null,
    incidents: {},
    digests: {},
    broadcasts: {},
    followups: {},
    playbook_runs: [],
  };
}

function normalizeOperationsState(value) {
  const out = {
    ...emptyOperationsState(),
    ...(value && typeof value === "object" ? value : {}),
  };
  out.incidents = normalizeObjectMap(out.incidents);
  out.digests = normalizeObjectMap(out.digests);
  out.broadcasts = normalizeObjectMap(out.broadcasts);
  out.followups = normalizeObjectMap(out.followups);
  out.playbook_runs = Array.isArray(out.playbook_runs) ? out.playbook_runs : [];
  return out;
}

function loadOperationsState() {
  if (!fs.existsSync(OPERATIONS_STATE_PATH)) return emptyOperationsState();

  try {
    const parsed = JSON.parse(fs.readFileSync(OPERATIONS_STATE_PATH, "utf8"));
    return normalizeOperationsState(parsed);
  } catch {
    return emptyOperationsState();
  }
}

function saveOperationsState(state) {
  ensureParentDirectory(OPERATIONS_STATE_PATH);
  const payload = normalizeOperationsState({
    ...state,
    updated_at: new Date().toISOString(),
  });
  fs.writeFileSync(OPERATIONS_STATE_PATH, JSON.stringify(payload, null, 2), "utf8");
}

function mutateOperationsState(mutator) {
  const state = loadOperationsState();
  const result = mutator(state);
  saveOperationsState(state);
  return result;
}

function createOperationId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(3).toString("hex")}`;
}

function appendRecordEvent(record, event) {
  const nextEvent = {
    ...event,
    recorded_at: event?.recorded_at || new Date().toISOString(),
  };
  const events = Array.isArray(record?.events) ? record.events.slice(-49) : [];
  events.push(nextEvent);
  record.events = events;
}

function upsertOperationRecord(state, collectionName, record) {
  const collection = normalizeObjectMap(state?.[collectionName]);
  collection[record.id] = {
    ...record,
    updated_at: record.updated_at || new Date().toISOString(),
  };
  state[collectionName] = collection;
  return collection[record.id];
}

function appendPlaybookRun(state, runRecord) {
  const records = Array.isArray(state?.playbook_runs) ? state.playbook_runs : [];
  records.push(runRecord);
  state.playbook_runs = records.slice(-200);
}

function getOperationRecord(state, collectionName, recordId) {
  const collection = normalizeObjectMap(state?.[collectionName]);
  return collection[recordId] || null;
}

function listOperationRecords(collection, options = {}) {
  const status = options.status ? String(options.status).trim().toLowerCase() : "";
  const limit = Math.max(1, Math.min(200, Number(options.limit) || 20));

  return Object.values(normalizeObjectMap(collection))
    .filter((record) => {
      if (!status) return true;
      return String(record?.status || "").trim().toLowerCase() === status;
    })
    .sort((a, b) =>
      String(b?.updated_at || b?.created_at || "").localeCompare(
        String(a?.updated_at || a?.created_at || "")
      )
    )
    .slice(0, limit);
}

function buildOperationsStateSummary(state) {
  const incidents = Object.values(normalizeObjectMap(state?.incidents));
  const broadcasts = Object.values(normalizeObjectMap(state?.broadcasts));
  const digests = Object.values(normalizeObjectMap(state?.digests));
  const followups = Object.values(normalizeObjectMap(state?.followups));

  return {
    incidents_total: incidents.length,
    incidents_open: incidents.filter((item) => item?.status !== "closed").length,
    broadcasts_total: broadcasts.length,
    broadcasts_sent: broadcasts.filter((item) => item?.status === "sent").length,
    digests_total: digests.length,
    followups_total: followups.length,
    playbook_runs_total: Array.isArray(state?.playbook_runs) ? state.playbook_runs.length : 0,
    last_updated_at: state?.updated_at || null,
  };
}

function normalizeTemplate(template) {
  if (Array.isArray(template)) {
    return template.map((line) => String(line));
  }
  if (typeof template === "string") {
    return template.split(/\r?\n/);
  }
  return [];
}

function renderTemplateText(template, context, separator = "\n") {
  return normalizeTemplate(template)
    .map((line) =>
      String(line).replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_, key) => {
        const value = context?.[key];
        return value === undefined || value === null ? "" : String(value);
      })
    )
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)
    .join(separator);
}

function loadTokenStore() {
  return normalizeTokenStore(readJsonFileSafely(TOKEN_STORE_PATH, emptyTokenStore()));
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
  return normalizeClientConfig(readJsonFileSafely(CLIENT_CONFIG_PATH, emptyClientConfig()));
}

function saveClientConfig(config) {
  ensureParentDirectory(CLIENT_CONFIG_PATH);
  fs.writeFileSync(
    CLIENT_CONFIG_PATH,
    JSON.stringify(normalizeClientConfig(config), null, 2),
    "utf8"
  );
}

function getRuntimeGatewayConfig() {
  const config = loadClientConfig();
  return {
    url: (GATEWAY_URL_ENV || config.gateway_url || "").replace(/\/+$/, ""),
    apiKey: GATEWAY_API_KEY || config.gateway_api_key || "",
    profile:
      process.env.SLACK_PROFILE ||
      GATEWAY_PROFILE ||
      config.profile ||
      "",
  };
}

function getAuthStatusSummary() {
  const runtimeGateway = getRuntimeGatewayConfig();
  const tokenStore = loadTokenStore();
  const selectedProfile = resolveTokenStoreProfileBySelector(
    tokenStore,
    process.env.SLACK_PROFILE
  );
  const envTokensPresent = {
    bot: Boolean(process.env.SLACK_BOT_TOKEN),
    user: Boolean(process.env.SLACK_USER_TOKEN),
    generic: Boolean(process.env.SLACK_TOKEN),
  };

  const gatewayReady = Boolean(runtimeGateway.url && runtimeGateway.apiKey && runtimeGateway.profile);
  const localTokenReady = Boolean(
    selectedProfile ||
      envTokensPresent.bot ||
      envTokensPresent.user ||
      envTokensPresent.generic
  );

  if (gatewayReady) {
    return {
      ready: true,
      mode: "gateway_onboard",
      summary:
        "This PC is ready via central gateway onboarding. Local Slack xoxb/xoxp tokens are not required on this PC.",
      runtimeGateway,
      selectedProfile,
      envTokensPresent,
    };
  }

  if (localTokenReady) {
    return {
      ready: true,
      mode: "local_tokens",
      summary:
        "This PC is ready via locally available Slack credentials.",
      runtimeGateway,
      selectedProfile,
      envTokensPresent,
    };
  }

  return {
    ready: false,
    mode: "not_configured",
    summary:
      "This PC is not ready yet. Run `slack-max-api-mcp onboard run` or configure local Slack tokens.",
    runtimeGateway,
    selectedProfile,
    envTokensPresent,
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

function buildGatewayAuthHeaders(apiKey) {
  const headers = { "Content-Type": "application/json; charset=utf-8" };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
    headers["X-API-Key"] = apiKey;
  }
  return headers;
}

function shouldBypassTlsVerification(targetUrl, mode = "generic") {
  try {
    const hostname = new URL(targetUrl).hostname.toLowerCase();
    if (hostname === GATEWAY_COMPAT_HOST) return true;
  } catch {
    // fall through to env-based flags
  }

  if (mode === "gateway") return GATEWAY_SKIP_TLS_VERIFY;
  if (mode === "onboard") return ONBOARD_SKIP_TLS_VERIFY;
  return INSECURE_TLS;
}

let tlsCompatWarningShown = false;

async function fetchWithCompatTls(targetUrl, options = {}, mode = "generic") {
  if (!shouldBypassTlsVerification(targetUrl, mode)) {
    return fetch(targetUrl, options);
  }

  const previous = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  if (!tlsCompatWarningShown) {
    tlsCompatWarningShown = true;
    console.error(
      `[${SERVER_NAME}] warning: TLS verification is temporarily disabled for ${mode} requests to support the legacy sslip.io gateway.`
    );
  }

  try {
    return await fetch(targetUrl, options);
  } finally {
    if (previous === undefined) {
      delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    } else {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = previous;
    }
  }
}

function truncateText(value, maxLen = 220) {
  const text = String(value || "");
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 3)}...`;
}

function safeJsonlAppend(filePath, payload) {
  if (!ENABLE_AUDIT_LOG) return;
  try {
    ensureParentDirectory(filePath);
    fs.appendFileSync(filePath, `${JSON.stringify(payload)}\n`, "utf8");
  } catch {
    // Ignore audit logging failures to avoid breaking API tools.
  }
}

function methodMatchesPrefix(method, prefixes) {
  return prefixes.some((prefix) => method.startsWith(prefix));
}

function assertMethodPolicy(method) {
  const normalizedMethod = String(method || "").trim().toLowerCase();
  if (!normalizedMethod) {
    throw new Error("Slack method name is required.");
  }

  if (METHOD_DENYLIST.has(normalizedMethod) || methodMatchesPrefix(normalizedMethod, METHOD_DENY_PREFIXES)) {
    throw new Error(`Method blocked by policy: ${method}`);
  }

  if (METHOD_ALLOWLIST.size === 0 && METHOD_ALLOW_PREFIXES.length === 0) {
    return;
  }

  const allowed =
    METHOD_ALLOWLIST.has(normalizedMethod) || methodMatchesPrefix(normalizedMethod, METHOD_ALLOW_PREFIXES);
  if (!allowed) {
    throw new Error(`Method not allowed by policy: ${method}`);
  }
}

function summarizeTopParticipants(messages, participantLimit = 5) {
  const counter = new Map();
  for (const message of messages) {
    const user = String(message?.user || "");
    if (!user) continue;
    counter.set(user, (counter.get(user) || 0) + 1);
  }

  return [...counter.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, participantLimit)
    .map(([user, message_count]) => ({ user, message_count }));
}

function summarizeChannelMessages(messages, options = {}) {
  const participantLimit = options.participantLimit ?? 5;
  const sampleSize = options.sampleSize ?? 5;
  const uniqueUsers = new Set();
  let threadRoots = 0;
  let totalReplies = 0;
  let totalReactions = 0;
  let totalAttachedFiles = 0;

  for (const message of messages) {
    const user = String(message?.user || "");
    if (user) uniqueUsers.add(user);

    const replyCount = Number(message?.reply_count || 0);
    if (replyCount > 0) {
      threadRoots += 1;
      totalReplies += replyCount;
    }

    const reactions = Array.isArray(message?.reactions) ? message.reactions : [];
    for (const reaction of reactions) {
      totalReactions += Number(reaction?.count || 0);
    }

    const files = Array.isArray(message?.files) ? message.files : [];
    totalAttachedFiles += files.length;
  }

  const latestSamples = messages.slice(0, sampleSize).map((message) => ({
    ts: message?.ts || "",
    user: message?.user || null,
    text: truncateText(message?.text || ""),
    subtype: message?.subtype || null,
  }));

  return {
    message_count: messages.length,
    unique_user_count: uniqueUsers.size,
    thread_root_count: threadRoots,
    threaded_reply_count: totalReplies,
    reaction_count: totalReactions,
    attached_file_count: totalAttachedFiles,
    top_participants: summarizeTopParticipants(messages, participantLimit),
    latest_samples: latestSamples,
  };
}

function safeReadAuditEntries(limit, filters = {}) {
  if (!fs.existsSync(AUDIT_LOG_PATH)) return [];
  const raw = fs.readFileSync(AUDIT_LOG_PATH, "utf8");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const parsed = [];

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (filters.event && entry?.event !== filters.event) continue;
      if (filters.method && entry?.method !== filters.method) continue;
      parsed.push(entry);
    } catch {
      // Skip malformed lines.
    }
  }

  const tail = parsed.slice(-limit).reverse();
  return tail;
}

function normalizeChannelReference(channelRef) {
  return String(channelRef || "").trim().replace(/^#/, "");
}

function isLikelyChannelId(value) {
  return /^[CGD][A-Z0-9]{8,}$/.test(String(value || "").trim());
}

async function resolveChannelReference(channelRef, tokenOverride) {
  const normalized = normalizeChannelReference(channelRef);
  if (!normalized) {
    throw new Error("Channel reference is required.");
  }

  if (isLikelyChannelId(normalized)) {
    return { id: normalized, name: null, source: "id", reference: channelRef };
  }

  let cursor = undefined;
  let page = 0;
  const target = normalized.toLowerCase();
  while (page < 15) {
    page += 1;
    const data = await callSlackApi(
      "conversations.list",
      {
        types: "public_channel,private_channel",
        exclude_archived: true,
        limit: 200,
        cursor,
      },
      tokenOverride
    );

    const channels = Array.isArray(data?.channels) ? data.channels : [];
    const exact = channels.find((channel) => String(channel?.name || "").toLowerCase() === target);
    if (exact?.id) {
      return {
        id: exact.id,
        name: exact.name || normalized,
        source: "name",
        reference: channelRef,
      };
    }

    cursor = data?.response_metadata?.next_cursor || "";
    if (!cursor) break;
  }

  throw new Error(`Channel not found by name: ${channelRef}`);
}

async function resolveChannelReferences(channelRefs, tokenOverride) {
  const refs = Array.isArray(channelRefs) ? channelRefs : [];
  if (refs.length === 0) {
    throw new Error("At least one channel reference is required.");
  }

  const resolved = [];
  const seen = new Set();
  for (const ref of refs) {
    const item = await resolveChannelReference(ref, tokenOverride);
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    resolved.push(item);
  }
  return resolved;
}

function buildDeferredChannelTargets(channelRefs) {
  const refs = Array.isArray(channelRefs) ? channelRefs : [];
  return refs
    .map((ref) => {
      const original = String(ref || "").trim();
      const normalized = normalizeChannelReference(ref);
      if (!normalized) return null;

      return {
        id: isLikelyChannelId(normalized) ? normalized : null,
        name: isLikelyChannelId(normalized) ? null : normalized,
        reference: original || normalized,
      };
    })
    .filter(Boolean);
}

function extractChannelTargetReferences(channelTargets) {
  const targets = Array.isArray(channelTargets) ? channelTargets : [];
  return targets
    .map((item) => item?.reference || item?.id || item?.name || "")
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

async function findUnansweredThreadsInChannel({
  channel,
  lookbackHours = 24,
  minAgeMinutes = 30,
  maxThreads = 20,
  includeBotReplies = false,
  tokenOverride,
}) {
  const oldest = String(Math.floor(Date.now() / 1000 - lookbackHours * 3600));
  const nowMs = Date.now();
  const history = await callSlackApi(
    "conversations.history",
    {
      channel,
      oldest,
      inclusive: true,
      limit: Math.min(1000, Math.max(10, maxThreads * 10)),
    },
    tokenOverride
  );

  const historyMessages = Array.isArray(history?.messages) ? history.messages : [];
  const rootMessages = historyMessages.filter(
    (message) => message?.ts && (!message.thread_ts || message.thread_ts === message.ts)
  );
  const candidates = rootMessages.filter((message) => {
    const text = String(message?.text || "");
    if (!text.includes("?") && Number(message?.reply_count || 0) <= 0) return false;
    const ageMs = nowMs - Number(message.ts) * 1000;
    return Number.isFinite(ageMs) && ageMs >= minAgeMinutes * 60 * 1000;
  });

  const unanswered = [];
  let scanned = 0;
  const scanLimit = Math.min(candidates.length, Math.max(1, maxThreads * 5));

  for (let idx = 0; idx < scanLimit; idx += 1) {
    if (unanswered.length >= maxThreads) break;
    const root = candidates[idx];
    scanned += 1;
    const replyCount = Number(root?.reply_count || 0);

    if (replyCount <= 0) {
      unanswered.push({
        channel,
        thread_ts: root.ts,
        root_user: root.user || null,
        root_text: truncateText(root.text || ""),
        reason: "no_replies",
        reply_count: 0,
        age_minutes: Math.floor((nowMs - Number(root.ts) * 1000) / (60 * 1000)),
      });
      continue;
    }

    try {
      const repliesData = await callSlackApi(
        "conversations.replies",
        { channel, ts: root.ts, limit: Math.min(100, replyCount + 2) },
        tokenOverride
      );
      const replies = Array.isArray(repliesData?.messages) ? repliesData.messages.slice(1) : [];
      const hasExternalReply = replies.some((reply) => {
        if (!includeBotReplies && reply?.bot_id) return false;
        const replyUser = String(reply?.user || "");
        return replyUser && replyUser !== String(root?.user || "");
      });

      if (!hasExternalReply) {
        unanswered.push({
          channel,
          thread_ts: root.ts,
          root_user: root.user || null,
          root_text: truncateText(root.text || ""),
          reason: "replies_only_from_author_or_bots",
          reply_count: replyCount,
          age_minutes: Math.floor((nowMs - Number(root.ts) * 1000) / (60 * 1000)),
        });
      }
    } catch (error) {
      unanswered.push({
        channel,
        thread_ts: root.ts,
        root_user: root.user || null,
        root_text: truncateText(root.text || ""),
        reason: "thread_check_failed",
        reply_count: replyCount,
        error: error instanceof Error ? error.message : String(error),
        age_minutes: Math.floor((nowMs - Number(root.ts) * 1000) / (60 * 1000)),
      });
    }
  }

  return {
    channel,
    lookback_hours: lookbackHours,
    min_age_minutes: minAgeMinutes,
    scanned_candidates: scanned,
    unanswered_count: unanswered.length,
    unanswered_threads: unanswered,
    history_has_more: Boolean(history?.has_more),
    next_cursor: history?.response_metadata?.next_cursor || null,
  };
}

function buildSupportDigestText(digestItems, lookbackHours, slaMinutes) {
  const lines = [
    renderTemplateText(OPERATIONS_CONFIG.support_digest.header_template, {
      lookback_hours: lookbackHours,
    }),
    renderTemplateText(OPERATIONS_CONFIG.support_digest.sla_template, {
      sla_minutes: slaMinutes,
    }),
    "",
  ];

  for (const item of digestItems) {
    lines.push(
      `#${item.channel_name || item.channel_reference || item.channel} | messages=${item.message_count} | participants=${item.unique_user_count} | unanswered=${item.unanswered_count}`
    );
  }

  return lines.join("\n");
}

function buildIncidentNextUpdateTs(nextUpdateMinutes) {
  const minutes =
    Math.max(
      1,
      Number(nextUpdateMinutes || OPERATIONS_CONFIG.incidents.update_interval_minutes || 15)
    ) || 15;
  return Math.floor(Date.now() / 1000 + minutes * 60);
}

function buildIncidentTemplateContext(payload = {}) {
  const severity = String(
    payload.severity || OPERATIONS_CONFIG.incidents.default_severity || "sev2"
  ).toLowerCase();
  const status = String(payload.status || "open").toLowerCase();
  const owner = payload.owner || OPERATIONS_CONFIG.incidents.default_owner || "TBD";
  const details = payload.details || "";

  return {
    title: payload.title || "Untitled incident",
    severity,
    severity_upper: severity.toUpperCase(),
    status,
    status_upper: status.toUpperCase(),
    owner,
    summary: payload.summary || "No summary provided.",
    details,
    details_line: details ? `Details: ${details}` : "",
    resolution: payload.resolution || "Resolved",
    next_update_text: payload.next_update_ts
      ? `<!date^${payload.next_update_ts}^{time}|scheduled>`
      : "TBD",
  };
}

function buildIncidentOpenText(payload) {
  return renderTemplateText(
    OPERATIONS_CONFIG.incidents.open_template,
    buildIncidentTemplateContext(payload),
    "\n"
  );
}

function buildIncidentUpdateText(payload) {
  return renderTemplateText(
    OPERATIONS_CONFIG.incidents.update_template,
    buildIncidentTemplateContext(payload),
    "\n"
  );
}

function buildIncidentCloseText(payload) {
  return renderTemplateText(
    OPERATIONS_CONFIG.incidents.close_template,
    buildIncidentTemplateContext(payload),
    "\n"
  );
}

function buildBroadcastText(payload = {}) {
  if (payload.text) return String(payload.text);

  const templates = normalizeObjectMap(OPERATIONS_CONFIG.broadcasts.templates);
  const templateId = payload.template_id || OPERATIONS_CONFIG.broadcasts.default_template;
  const template =
    templates[templateId] ||
    templates[OPERATIONS_CONFIG.broadcasts.default_template] || [
      "{{title}}",
      "{{summary}}",
      "{{details}}",
    ];

  return renderTemplateText(
    template,
    {
      title: payload.title || "",
      summary: payload.summary || "",
      details: payload.details || "",
    },
    "\n\n"
  );
}

function buildFollowupStateKey(channel, threadTs) {
  return `${String(channel || "").trim()}:${String(threadTs || "").trim()}`;
}

async function callSlackApiWithToken(method, params = {}, token, tokenSource) {
  const url = `${SLACK_API_BASE_URL.replace(/\/+$/, "")}/${method}`;
  const startedAt = Date.now();
  const paramKeys = Object.keys(toRecordObject(params));

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
    safeJsonlAppend(AUDIT_LOG_PATH, {
      ts: new Date().toISOString(),
      event: "slack_api_call",
      method,
      ok: false,
      token_source: tokenSource,
      status: response.status,
      duration_ms: Date.now() - startedAt,
      params_keys: paramKeys,
      error: "non_json_response",
    });
    throw new Error(`Slack API returned non-JSON for ${method} (HTTP ${response.status}).`);
  }

  if (!response.ok) {
    safeJsonlAppend(AUDIT_LOG_PATH, {
      ts: new Date().toISOString(),
      event: "slack_api_call",
      method,
      ok: false,
      token_source: tokenSource,
      status: response.status,
      duration_ms: Date.now() - startedAt,
      params_keys: paramKeys,
      error: data.error || "unknown_error",
    });
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
    safeJsonlAppend(AUDIT_LOG_PATH, {
      ts: new Date().toISOString(),
      event: "slack_api_call",
      method,
      ok: false,
      token_source: tokenSource,
      status: response.status,
      duration_ms: Date.now() - startedAt,
      params_keys: paramKeys,
      error: data.error || "unknown_error",
    });
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

  safeJsonlAppend(AUDIT_LOG_PATH, {
    ts: new Date().toISOString(),
    event: "slack_api_call",
    method,
    ok: true,
    token_source: tokenSource,
    status: response.status,
    duration_ms: Date.now() - startedAt,
    params_keys: paramKeys,
  });

  return data;
}

async function callSlackApiViaGateway(method, params = {}, tokenOverride, options = {}) {
  const runtimeGateway = getRuntimeGatewayConfig();
  if (!runtimeGateway.url) {
    throw new Error(
      "Gateway URL is missing. Run `slack-max-api-mcp onboard run` or set SLACK_GATEWAY_URL."
    );
  }

  const response = await fetchWithCompatTls(
    `${runtimeGateway.url}/api/slack/call`,
    {
      method: "POST",
      headers: buildGatewayAuthHeaders(runtimeGateway.apiKey),
      body: JSON.stringify({
        method,
        params,
        token_override: tokenOverride || undefined,
        profile_selector: options.profileSelector || runtimeGateway.profile || undefined,
        preferred_token_type:
          options.preferredTokenType || process.env.SLACK_DEFAULT_TOKEN_TYPE || undefined,
      }),
    },
    "gateway"
  );

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
    throw new Error(
      "Gateway URL is missing. Run `slack-max-api-mcp onboard run` or set SLACK_GATEWAY_URL."
    );
  }

  const response = await fetchWithCompatTls(
    `${runtimeGateway.url}/api/slack/http`,
    {
      method: "POST",
      headers: buildGatewayAuthHeaders(runtimeGateway.apiKey),
      body: JSON.stringify({
        ...input,
        profile_selector: input.profile_selector || runtimeGateway.profile || undefined,
        preferred_token_type:
          input.preferred_token_type || process.env.SLACK_DEFAULT_TOKEN_TYPE || undefined,
      }),
    },
    "gateway"
  );

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
  assertMethodPolicy(method);
  const runtimeGateway = getRuntimeGatewayConfig();
  if (runtimeGateway.url) {
    return callSlackApiViaGateway(method, params, tokenOverride, options);
  }
  const candidates = getSlackTokenCandidates(tokenOverride, options);
  if (candidates.length === 0) {
    throw new Error(
      "Slack token is missing. Set SLACK_BOT_TOKEN/SLACK_USER_TOKEN/SLACK_TOKEN, run `slack-max-api-mcp oauth login`, or use `slack-max-api-mcp onboard run` for gateway mode."
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

function formatClientConfigSummary(config) {
  const hasGateway = Boolean(config?.gateway_url);
  const hasApiKey = Boolean(config?.gateway_api_key);
  const profile = config?.profile || "";
  const updatedAt = config?.updated_at || "unknown";

  return [
    `[gateway] client config: ${CLIENT_CONFIG_PATH}`,
    `    gateway=${hasGateway ? config.gateway_url : "not_set"} | api_key=${hasApiKey ? "present" : "missing"} | profile=${profile || "not_set"} | updated_at=${updatedAt}`,
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
  const clientConfig = loadClientConfig();
  const auth = getAuthStatusSummary();
  const keys = Object.keys(tokenStore.profiles);
  console.log(`[auth] ${auth.ready ? "ready" : "not_ready"} (${auth.mode})`);
  console.log(`    ${auth.summary}`);

  if (keys.length === 0) {
    console.log(`[oauth] no saved profiles in ${TOKEN_STORE_PATH}`);
  } else {
    console.log(`[oauth] profiles in ${TOKEN_STORE_PATH}`);
    for (const key of keys) {
      console.log(formatTokenProfileSummary(key, tokenStore.profiles[key], tokenStore.default_profile === key));
    }
  }

  if (clientConfig.gateway_url || clientConfig.profile || clientConfig.gateway_api_key) {
    console.log(formatClientConfigSummary(clientConfig));
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
  const clientConfig = loadClientConfig();
  const auth = getAuthStatusSummary();
  console.log(`[auth] ${auth.ready ? "ready" : "not_ready"} (${auth.mode})`);
  console.log(`    ${auth.summary}`);

  if (resolved) {
    console.log("");
    console.log(formatTokenProfileSummary(resolved.key, resolved.profile, tokenStore.default_profile === resolved.key));
  }
  if (clientConfig.gateway_url || clientConfig.profile || clientConfig.gateway_api_key) {
    if (resolved) console.log("");
    console.log(formatClientConfigSummary(clientConfig));
    return;
  }
  if (!resolved) {
    console.log("");
    console.log("[oauth] no active profile");
  }
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
  const response = await fetchWithCompatTls(url, options, "onboard");
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
    "  slack-max-api-mcp onboard run --gateway https://gateway.example.com [--token <invite_token>]",
    "    [--profile NAME] [--team T123] [--scope a,b] [--user-scope c,d]",
    "  slack-max-api-mcp onboard help",
    "",
    "Notes:",
    `  - Default onboard server: ${ONBOARD_SERVER_URL}`,
    "  - This command does not require SLACK_CLIENT_SECRET on team PCs.",
    "  - It supports both legacy claim-token onboarding and public gateway onboarding.",
    "  - Gateway mode saves client.json locally so team PCs can use the central server without local Slack tokens.",
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
  const serverBase = String(
    options.gateway || options.url || options.server || ONBOARD_SERVER_URL
  )
    .trim()
    .replace(/\/+$/, "");
  if (!serverBase) {
    throw new Error(
      "Missing onboard server URL. Use --server/--gateway or set SLACK_ONBOARD_SERVER_URL."
    );
  }

  const requestedProfile = String(options.profile || "").trim() || createAutoOnboardProfileName("auto");
  const requestedTeam = String(options.team || "").trim();
  const requestedScope = parseScopeList(options.scope || "").join(",");
  const requestedUserScope = parseScopeList(options["user-scope"] || "").join(",");
  const inviteToken = String(options.token || "").trim();

  const bootstrapParams = new URLSearchParams();
  if (requestedProfile) bootstrapParams.set("profile", requestedProfile);
  if (requestedTeam) bootstrapParams.set("team", requestedTeam);
  if (requestedScope) bootstrapParams.set("scope", requestedScope);
  if (requestedUserScope) bootstrapParams.set("user_scope", requestedUserScope);

  const bootstrapUrl = inviteToken
    ? `${serverBase}/onboard/resolve?token=${encodeURIComponent(inviteToken)}`
    : `${serverBase}/onboard/bootstrap${bootstrapParams.toString() ? `?${bootstrapParams.toString()}` : ""}`;
  const bootstrap = await fetchJsonResponse(
    bootstrapUrl,
    { method: "GET", headers: { Accept: "application/json" } },
    "Onboard bootstrap"
  );

  const resolvedGatewayUrl = String(bootstrap.gateway_url || serverBase).replace(/\/+$/, "");
  const resolvedGatewayApiKey = String(bootstrap.gateway_api_key || "");
  const resolvedProfile = String(bootstrap.profile || requestedProfile || "");
  const oauthStartUrl = String(bootstrap.oauth_start_url || "");
  const isGatewayBootstrap =
    Boolean(bootstrap.gateway_url) ||
    Boolean(bootstrap.gateway_api_key) ||
    Boolean(oauthStartUrl) ||
    bootstrap.mode === "public_onboard" ||
    bootstrap.mode === "invite_token";

  if (isGatewayBootstrap) {
    if (bootstrap.requires_gateway_api_key && !resolvedGatewayApiKey) {
      throw new Error(
        "Gateway requires API key but onboarding response did not provide one."
      );
    }

    saveClientConfig({
      version: 1,
      gateway_url: resolvedGatewayUrl,
      gateway_api_key: resolvedGatewayApiKey,
      profile: resolvedProfile,
      updated_at: new Date().toISOString(),
    });

    if (oauthStartUrl) {
      const opened = openExternalUrl(oauthStartUrl);
      if (!opened) {
        console.log(`[onboard] Open this URL in browser:\n${oauthStartUrl}`);
      } else {
        console.log("[onboard] Browser opened for OAuth approval.");
      }
    }

    console.log(`[onboard] client config saved: ${CLIENT_CONFIG_PATH}`);
    console.log(`[onboard] gateway: ${resolvedGatewayUrl}`);
    if (resolvedProfile) console.log(`[onboard] profile: ${resolvedProfile}`);
    if (bootstrap.mode === "public_onboard") {
      console.log("[onboard] mode: public_onboard (tokenless)");
    } else if (bootstrap.mode === "invite_token") {
      console.log("[onboard] mode: invite_token");
    }
    console.log("[onboard] Next: approve in browser, then use Codex MCP as usual.");
    return;
  }

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

async function runGatewayCompatCli(args) {
  const subcommand = (args[0] || "help").toLowerCase();
  if (subcommand === "help" || subcommand === "--help" || subcommand === "-h") {
    console.log("[gateway] deprecated alias detected. Use `onboard-server start` instead.");
    printOnboardServerHelp();
    return;
  }
  if (subcommand === "start") {
    console.error("[gateway] deprecated alias detected. Redirecting to `onboard-server start`.");
    await runOnboardServerStart(args.slice(1));
    return;
  }

  throw new Error(
    `Unknown gateway command: ${subcommand}. Use 'slack-max-api-mcp onboard-server help' for available commands.`
  );
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

  const res = await fetchWithCompatTls(endpoint.toString(), {
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
          method_policy: {
            allowlist_count: METHOD_ALLOWLIST.size,
            denylist_count: METHOD_DENYLIST.size,
            allow_prefix_count: METHOD_ALLOW_PREFIXES.length,
            deny_prefix_count: METHOD_DENY_PREFIXES.length,
          },
          audit_enabled: ENABLE_AUDIT_LOG,
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

function registerOperationsTools(server) {
  function recordPlaybookExecution(state, payload) {
    appendPlaybookRun(state, {
      id: createOperationId("playbook"),
      recorded_at: new Date().toISOString(),
      ...payload,
    });
  }

  async function createIncidentWorkflow(input, options = {}) {
    const dryRun = input.dry_run !== false;
    const announce = input.announce !== false;
    const channelRef = input.channel || OPERATIONS_CONFIG.incidents.default_channel || "";
    const incidentSeverity =
      input.severity || OPERATIONS_CONFIG.incidents.default_severity || "sev2";
    const incidentOwner = input.owner || OPERATIONS_CONFIG.incidents.default_owner || "TBD";
    const nextUpdateTs = buildIncidentNextUpdateTs(input.next_update_minutes);
    const resolvedChannel = channelRef
      ? await resolveChannelReference(channelRef, input.token_override)
      : null;

    if (announce && !resolvedChannel) {
      throw new Error(
        "`channel` is required when announce is enabled and no default incident channel is configured."
      );
    }

    const messageText = buildIncidentOpenText({
      title: input.title,
      severity: incidentSeverity,
      owner: incidentOwner,
      summary: input.summary,
      details: input.details,
      next_update_ts: nextUpdateTs,
    });

    if (dryRun) {
      return {
        operation: "incident_create",
        dry_run: true,
        target_channel: resolvedChannel,
        message_preview: messageText,
        incident_preview: {
          title: input.title,
          severity: incidentSeverity,
          owner: incidentOwner,
          status: "open",
          next_update_ts: nextUpdateTs,
        },
      };
    }

    let posted = null;
    if (announce && resolvedChannel) {
      posted = await callSlackApi(
        "chat.postMessage",
        {
          channel: resolvedChannel.id,
          text: messageText,
          mrkdwn: true,
        },
        input.token_override
      );
    }

    const now = new Date().toISOString();
    const incidentRecord = {
      id: createOperationId("incident"),
      title: input.title,
      summary: input.summary || "No summary provided.",
      details: input.details || "",
      owner: incidentOwner,
      severity: incidentSeverity,
      status: "open",
      channel: resolvedChannel
        ? {
            id: resolvedChannel.id,
            name: resolvedChannel.name || null,
            reference: resolvedChannel.reference || channelRef,
          }
        : null,
      root_ts: posted?.ts || null,
      next_update_ts: nextUpdateTs,
      created_at: now,
      updated_at: now,
      source: options.source || "ops_incident_create",
    };
    appendRecordEvent(incidentRecord, {
      type: "created",
      summary: incidentRecord.summary,
      source: options.source || "ops_incident_create",
      posted_ts: posted?.ts || null,
    });

    mutateOperationsState((state) => {
      upsertOperationRecord(state, "incidents", incidentRecord);
      if (options.playbook) {
        recordPlaybookExecution(state, {
          playbook: options.playbook,
          dry_run: false,
          collection: "incidents",
          record_id: incidentRecord.id,
        });
      }
    });

    return {
      operation: "incident_create",
      dry_run: false,
      target_channel: resolvedChannel,
      channel: posted?.channel || resolvedChannel?.id || null,
      ts: posted?.ts || null,
      incident: incidentRecord,
    };
  }

  async function generateSupportDigestWorkflow(input, options = {}) {
    const channelRefs =
      Array.isArray(input.channels) && input.channels.length > 0
        ? input.channels
        : input.channel
        ? [input.channel]
        : [];
    if (channelRefs.length === 0) {
      throw new Error("`channels` (or `channel`) is required for support_digest.");
    }

    const resolvedChannels = await resolveChannelReferences(channelRefs, input.token_override);
    const lookbackHours =
      input.lookback_hours ?? OPERATIONS_CONFIG.support_digest.default_lookback_hours ?? 24;
    const slaMinutes =
      input.sla_minutes ?? OPERATIONS_CONFIG.support_digest.default_sla_minutes ?? 60;
    const perChannelMaxThreads =
      input.max_threads ?? OPERATIONS_CONFIG.support_digest.default_max_threads ?? 10;
    const digestItems = [];

    for (const resolved of resolvedChannels) {
      const oldest = String(Math.floor(Date.now() / 1000 - lookbackHours * 3600));
      const history = await callSlackApi(
        "conversations.history",
        {
          channel: resolved.id,
          oldest,
          inclusive: true,
          limit: 200,
        },
        input.token_override
      );
      const messages = Array.isArray(history?.messages) ? history.messages : [];
      const snapshot = summarizeChannelMessages(messages, {
        participantLimit: 3,
        sampleSize: 3,
      });
      const unanswered = await findUnansweredThreadsInChannel({
        channel: resolved.id,
        lookbackHours,
        minAgeMinutes: slaMinutes,
        maxThreads: perChannelMaxThreads,
        includeBotReplies: false,
        tokenOverride: input.token_override,
      });

      digestItems.push({
        channel: resolved.id,
        channel_name: resolved.name || null,
        channel_reference: resolved.reference || resolved.id,
        message_count: snapshot.message_count,
        unique_user_count: snapshot.unique_user_count,
        unanswered_count: unanswered.unanswered_count,
        top_participants: snapshot.top_participants,
      });
    }

    const digestText = buildSupportDigestText(digestItems, lookbackHours, slaMinutes);
    const dryRun = input.dry_run !== false;

    if (dryRun || !input.report_channel) {
      return {
        operation: "support_digest",
        dry_run: true,
        lookback_hours: lookbackHours,
        sla_minutes: slaMinutes,
        digest_items: digestItems,
        digest_preview: digestText,
        note: input.report_channel
          ? "Set dry_run=false to post this digest."
          : "Provide report_channel and set dry_run=false to post this digest.",
      };
    }

    const reportTarget = await resolveChannelReference(input.report_channel, input.token_override);
    const posted = await callSlackApi(
      "chat.postMessage",
      {
        channel: reportTarget.id,
        text: digestText,
        mrkdwn: true,
      },
      input.token_override
    );

    const now = new Date().toISOString();
    const digestRecord = {
      id: createOperationId("digest"),
      status: "posted",
      channels: resolvedChannels.map((item) => ({
        id: item.id,
        name: item.name || null,
        reference: item.reference || item.id,
      })),
      report_channel: {
        id: reportTarget.id,
        name: reportTarget.name || null,
        reference: reportTarget.reference || input.report_channel,
      },
      lookback_hours: lookbackHours,
      sla_minutes: slaMinutes,
      digest_items: digestItems,
      digest_text: digestText,
      posted_ts: posted?.ts || null,
      created_at: now,
      updated_at: now,
      source: options.source || "ops_playbook_run",
    };

    mutateOperationsState((state) => {
      upsertOperationRecord(state, "digests", digestRecord);
      if (options.playbook) {
        recordPlaybookExecution(state, {
          playbook: options.playbook,
          dry_run: false,
          collection: "digests",
          record_id: digestRecord.id,
        });
      }
    });

    return {
      operation: "support_digest",
      dry_run: false,
      report_channel: reportTarget,
      ts: posted?.ts || null,
      digest: digestRecord,
    };
  }

  async function prepareBroadcastDraftWorkflow(input) {
    const deferredChannels = buildDeferredChannelTargets(input.channels);
    if (deferredChannels.length === 0) {
      throw new Error("At least one channel reference is required.");
    }
    const text = buildBroadcastText(input).trim();
    if (!text) {
      throw new Error("Provide `text` or enough template fields to build a broadcast message.");
    }

    const now = new Date().toISOString();
    const draftRecord = {
      id: createOperationId("broadcast"),
      title: input.title || null,
      summary: input.summary || null,
      details: input.details || null,
      template_id: input.template_id || OPERATIONS_CONFIG.broadcasts.default_template || null,
      text,
      mrkdwn: input.mrkdwn ?? OPERATIONS_CONFIG.broadcasts.default_mrkdwn ?? true,
      status: "draft",
      channel_targets: deferredChannels,
      created_at: now,
      updated_at: now,
      source: "ops_broadcast_prepare",
    };
    appendRecordEvent(draftRecord, { type: "prepared" });

    mutateOperationsState((state) => {
      upsertOperationRecord(state, "broadcasts", draftRecord);
    });

    return {
      broadcast: draftRecord,
      payload_preview: {
        text: truncateText(text, 500),
        mrkdwn: draftRecord.mrkdwn,
      },
    };
  }

  async function sendBroadcastWorkflow(input, options = {}) {
    const dryRun = input.dry_run !== false;
    let existingRecord = null;
    let resolvedChannels = [];
    let text = "";
    let title = input.title || null;
    let summary = input.summary || null;
    let details = input.details || null;
    let templateId = input.template_id || OPERATIONS_CONFIG.broadcasts.default_template || null;
    let defaultMrkdwn = input.mrkdwn;

    if (input.broadcast_id) {
      const state = loadOperationsState();
      existingRecord = getOperationRecord(state, "broadcasts", input.broadcast_id);
      if (!existingRecord) {
        throw new Error(`Broadcast draft not found: ${input.broadcast_id}`);
      }
      resolvedChannels = Array.isArray(existingRecord.channel_targets)
        ? existingRecord.channel_targets
        : [];
      text = existingRecord.text || "";
      title = title || existingRecord.title || null;
      summary = summary || existingRecord.summary || null;
      details = details || existingRecord.details || null;
      templateId = templateId || existingRecord.template_id || null;
      defaultMrkdwn =
        input.mrkdwn ?? existingRecord.mrkdwn ?? OPERATIONS_CONFIG.broadcasts.default_mrkdwn ?? true;
    } else {
      if (!Array.isArray(input.channels) || input.channels.length === 0) {
        throw new Error("`channels` is required when broadcast_id is not provided.");
      }
      resolvedChannels = buildDeferredChannelTargets(input.channels);
      text = buildBroadcastText(input).trim();
      defaultMrkdwn = input.mrkdwn ?? OPERATIONS_CONFIG.broadcasts.default_mrkdwn ?? true;
    }

    if (!text) {
      throw new Error("Provide `text` or enough template fields to build a broadcast message.");
    }

    const payload = {
      text,
      blocks: parseJsonMaybe(input.blocks),
      mrkdwn: defaultMrkdwn,
      unfurl_links: input.unfurl_links,
      unfurl_media: input.unfurl_media,
    };

    if (dryRun) {
      return {
        dry_run: true,
        broadcast_id: existingRecord?.id || null,
        channel_count: resolvedChannels.length,
        channels: resolvedChannels,
        payload_preview: {
          ...payload,
          text: truncateText(text, 500),
        },
      };
    }

    const targetReferences = extractChannelTargetReferences(resolvedChannels);
    if (targetReferences.length === 0) {
      throw new Error("At least one channel reference is required to send a broadcast.");
    }

    resolvedChannels = await resolveChannelReferences(targetReferences, input.token_override);

    const results = [];
    for (const channel of resolvedChannels) {
      try {
        const data = await callSlackApi(
          "chat.postMessage",
          {
            channel: channel.id,
            ...payload,
          },
          input.token_override
        );
        results.push({
          channel: channel.id,
          channel_name: channel.name || null,
          ok: true,
          ts: data?.ts || null,
        });
      } catch (error) {
        results.push({
          channel: channel.id,
          channel_name: channel.name || null,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const successCount = results.filter((item) => item.ok).length;
    const now = new Date().toISOString();
    const broadcastRecord = {
      id: existingRecord?.id || createOperationId("broadcast"),
      title,
      summary,
      details,
      template_id: templateId,
      text,
      mrkdwn: payload.mrkdwn,
      status: successCount === resolvedChannels.length ? "sent" : "partial",
      channel_targets: resolvedChannels.map((item) => ({
        id: item.id,
        name: item.name || null,
        reference: item.reference || item.id,
      })),
      created_at: existingRecord?.created_at || now,
      updated_at: now,
      sent_at: now,
      results,
      source: options.source || existingRecord?.source || "ops_broadcast_message",
    };
    appendRecordEvent(broadcastRecord, {
      type: "sent",
      success_count: successCount,
      failed_count: resolvedChannels.length - successCount,
    });

    mutateOperationsState((state) => {
      upsertOperationRecord(state, "broadcasts", broadcastRecord);
      if (options.playbook) {
        recordPlaybookExecution(state, {
          playbook: options.playbook,
          dry_run: false,
          collection: "broadcasts",
          record_id: broadcastRecord.id,
        });
      }
    });

    return {
      dry_run: false,
      broadcast: broadcastRecord,
      channel_count: resolvedChannels.length,
      success_count: successCount,
      failed_count: resolvedChannels.length - successCount,
      results,
    };
  }

  server.registerTool(
    "ops_policy_info",
    {
      description:
        "Show operational guardrails for this MCP (method policy and local audit settings).",
      inputSchema: {},
    },
    async () =>
      safeToolRun(async () => ({
        execution_mode: "local_stdio",
        tool_exposure_mode: TOOL_EXPOSURE_MODE,
        tool_surface: {
          gateway_tools_exposed: EXPOSE_GATEWAY_TOOLS,
          raw_core_tools_exposed: EXPOSE_CORE_TOOLS,
          method_tools_enabled: ENABLE_METHOD_TOOLS,
        },
        method_policy: {
          allowlist: [...METHOD_ALLOWLIST.values()],
          denylist: [...METHOD_DENYLIST.values()],
          allow_prefixes: METHOD_ALLOW_PREFIXES,
          deny_prefixes: METHOD_DENY_PREFIXES,
        },
        audit: {
          enabled: ENABLE_AUDIT_LOG,
          path: AUDIT_LOG_PATH,
          note: "Audit entries are written as JSONL and avoid token values.",
        },
        operations: {
          config_path: OPERATIONS_CONFIG_PATH,
          state_path: OPERATIONS_STATE_PATH,
          summary: buildOperationsStateSummary(loadOperationsState()),
        },
        playbooks: OPS_PLAYBOOKS,
      }))
  );

  server.registerTool(
    "ops_playbook_list",
    {
      description: "List built-in operations playbooks that can run multi-step Slack workflows.",
      inputSchema: {},
    },
    async () =>
      safeToolRun(async () => ({
        count: OPS_PLAYBOOKS.length,
        playbooks: OPS_PLAYBOOKS,
      }))
  );

  server.registerTool(
    "ops_state_overview",
    {
      description:
        "Inspect local operations state for incidents, digests, broadcasts, followups, and playbook runs.",
      inputSchema: {
        collection: z
          .enum(["summary", "incidents", "digests", "broadcasts", "followups", "playbook_runs"])
          .optional(),
        status: z.string().optional(),
        limit: z.number().int().min(1).max(200).optional(),
      },
    },
    async ({ collection, status, limit }) =>
      safeToolRun(async () => {
        const state = loadOperationsState();
        const targetCollection = collection || "summary";

        if (targetCollection === "summary") {
          return {
            config_path: OPERATIONS_CONFIG_PATH,
            state_path: OPERATIONS_STATE_PATH,
            summary: buildOperationsStateSummary(state),
            recent_incidents: listOperationRecords(state.incidents, { limit: 5 }),
            recent_broadcasts: listOperationRecords(state.broadcasts, { limit: 5 }),
            recent_digests: listOperationRecords(state.digests, { limit: 5 }),
          };
        }

        if (targetCollection === "playbook_runs") {
          const records = Array.isArray(state.playbook_runs) ? state.playbook_runs : [];
          return {
            collection: targetCollection,
            count: records.length,
            records: records.slice(-(limit ?? 20)).reverse(),
          };
        }

        return {
          collection: targetCollection,
          count: Object.keys(normalizeObjectMap(state[targetCollection])).length,
          records: listOperationRecords(state[targetCollection], {
            status,
            limit: limit ?? 20,
          }),
        };
      })
  );

  server.registerTool(
    "ops_incident_create",
    {
      description:
        "Create and optionally announce a tracked incident record using config-backed incident templates.",
      inputSchema: {
        channel: z.string().optional(),
        title: z.string().min(1),
        summary: z.string().optional(),
        details: z.string().optional(),
        owner: z.string().optional(),
        severity: z.enum(["sev1", "sev2", "sev3", "sev4"]).optional(),
        next_update_minutes: z.number().int().min(1).max(1440).optional(),
        announce: z.boolean().optional(),
        dry_run: z.boolean().optional(),
        token_override: z.string().optional(),
      },
    },
    async (input) =>
      safeToolRun(async () => createIncidentWorkflow(input, { source: "ops_incident_create" }))
  );

  server.registerTool(
    "ops_incident_update",
    {
      description:
        "Update a tracked incident, optionally post a thread update, and persist the new operational status.",
      inputSchema: {
        incident_id: z.string().min(1),
        status: z
          .enum(["open", "investigating", "identified", "mitigating", "monitoring"])
          .optional(),
        summary: z.string().optional(),
        details: z.string().optional(),
        owner: z.string().optional(),
        severity: z.enum(["sev1", "sev2", "sev3", "sev4"]).optional(),
        next_update_minutes: z.number().int().min(1).max(1440).optional(),
        post_update: z.boolean().optional(),
        dry_run: z.boolean().optional(),
        token_override: z.string().optional(),
      },
    },
    async ({
      incident_id,
      status,
      summary,
      details,
      owner,
      severity,
      next_update_minutes,
      post_update,
      dry_run,
      token_override,
    }) =>
      safeToolRun(async () => {
        const state = loadOperationsState();
        const existing = getOperationRecord(state, "incidents", incident_id);
        if (!existing) {
          throw new Error(`Incident not found: ${incident_id}`);
        }

        const nextIncident = {
          ...existing,
          status: status || existing.status || "open",
          summary: summary || existing.summary || "No summary provided.",
          details: details !== undefined ? details : existing.details || "",
          owner: owner || existing.owner || OPERATIONS_CONFIG.incidents.default_owner || "TBD",
          severity:
            severity || existing.severity || OPERATIONS_CONFIG.incidents.default_severity || "sev2",
          next_update_ts:
            next_update_minutes !== undefined
              ? buildIncidentNextUpdateTs(next_update_minutes)
              : existing.next_update_ts || buildIncidentNextUpdateTs(),
        };

        const messageText = buildIncidentUpdateText({
          title: existing.title,
          severity: nextIncident.severity,
          owner: nextIncident.owner,
          summary: nextIncident.summary,
          details: nextIncident.details,
          status: nextIncident.status,
          next_update_ts: nextIncident.next_update_ts,
        });

        if (dry_run !== false) {
          return {
            operation: "incident_update",
            dry_run: true,
            incident_id,
            target_channel: existing.channel || null,
            message_preview: messageText,
            incident_preview: nextIncident,
          };
        }

        let posted = null;
        if (post_update !== false && existing.channel?.id) {
          posted = await callSlackApi(
            "chat.postMessage",
            {
              channel: existing.channel.id,
              thread_ts: existing.root_ts || undefined,
              text: messageText,
              mrkdwn: true,
            },
            token_override
          );
        }

        const updatedAt = new Date().toISOString();
        const updatedIncident = {
          ...existing,
          ...nextIncident,
          updated_at: updatedAt,
        };
        appendRecordEvent(updatedIncident, {
          type: "updated",
          status: updatedIncident.status,
          summary: updatedIncident.summary,
          posted_ts: posted?.ts || null,
        });

        mutateOperationsState((mutableState) => {
          upsertOperationRecord(mutableState, "incidents", updatedIncident);
        });

        return {
          operation: "incident_update",
          dry_run: false,
          ts: posted?.ts || null,
          incident: updatedIncident,
        };
      })
  );

  server.registerTool(
    "ops_incident_close",
    {
      description:
        "Close a tracked incident, optionally post a closure update, and persist the final resolution.",
      inputSchema: {
        incident_id: z.string().min(1),
        resolution: z.string().optional(),
        details: z.string().optional(),
        owner: z.string().optional(),
        post_update: z.boolean().optional(),
        dry_run: z.boolean().optional(),
        token_override: z.string().optional(),
      },
    },
    async ({ incident_id, resolution, details, owner, post_update, dry_run, token_override }) =>
      safeToolRun(async () => {
        const state = loadOperationsState();
        const existing = getOperationRecord(state, "incidents", incident_id);
        if (!existing) {
          throw new Error(`Incident not found: ${incident_id}`);
        }

        const nextIncident = {
          ...existing,
          status: "closed",
          owner: owner || existing.owner || OPERATIONS_CONFIG.incidents.default_owner || "TBD",
          details: details !== undefined ? details : existing.details || "",
          resolution: resolution || "Resolved",
          next_update_ts: null,
        };

        const messageText = buildIncidentCloseText({
          title: existing.title,
          severity: nextIncident.severity,
          owner: nextIncident.owner,
          details: nextIncident.details,
          resolution: nextIncident.resolution,
          status: "closed",
        });

        if (dry_run !== false) {
          return {
            operation: "incident_close",
            dry_run: true,
            incident_id,
            target_channel: existing.channel || null,
            message_preview: messageText,
            incident_preview: nextIncident,
          };
        }

        let posted = null;
        if (post_update !== false && existing.channel?.id) {
          posted = await callSlackApi(
            "chat.postMessage",
            {
              channel: existing.channel.id,
              thread_ts: existing.root_ts || undefined,
              text: messageText,
              mrkdwn: true,
            },
            token_override
          );
        }

        const updatedAt = new Date().toISOString();
        const closedIncident = {
          ...nextIncident,
          closed_at: updatedAt,
          updated_at: updatedAt,
        };
        appendRecordEvent(closedIncident, {
          type: "closed",
          resolution: closedIncident.resolution,
          posted_ts: posted?.ts || null,
        });

        mutateOperationsState((mutableState) => {
          upsertOperationRecord(mutableState, "incidents", closedIncident);
        });

        return {
          operation: "incident_close",
          dry_run: false,
          ts: posted?.ts || null,
          incident: closedIncident,
        };
      })
  );

  server.registerTool(
    "ops_broadcast_prepare",
    {
      description:
        "Create a tracked broadcast draft before sending it to one or more channels.",
      inputSchema: {
        channels: z.array(z.string().min(1)).min(1).max(20),
        text: z.string().optional(),
        title: z.string().optional(),
        summary: z.string().optional(),
        details: z.string().optional(),
        template_id: z.string().optional(),
        mrkdwn: z.boolean().optional(),
        token_override: z.string().optional(),
      },
    },
    async (input) => safeToolRun(async () => prepareBroadcastDraftWorkflow(input))
  );

  server.registerTool(
    "ops_playbook_run",
    {
      description:
        "Run a named operations playbook (incident open, support digest, release broadcast) with config-backed defaults and state persistence.",
      inputSchema: {
        playbook: z.enum(["incident_open", "support_digest", "release_broadcast"]),
        channel: z.string().optional(),
        channels: z.array(z.string().min(1)).max(20).optional(),
        report_channel: z.string().optional(),
        title: z.string().optional(),
        summary: z.string().optional(),
        details: z.string().optional(),
        owner: z.string().optional(),
        severity: z.enum(["sev1", "sev2", "sev3", "sev4"]).optional(),
        lookback_hours: z.number().int().min(1).max(168).optional(),
        sla_minutes: z.number().int().min(1).max(10080).optional(),
        max_threads: z.number().int().min(1).max(50).optional(),
        next_update_minutes: z.number().int().min(1).max(1440).optional(),
        dry_run: z.boolean().optional(),
        token_override: z.string().optional(),
      },
    },
    async ({
      playbook,
      channel,
      channels,
      report_channel,
      title,
      summary,
      details,
      owner,
      severity,
      lookback_hours,
      sla_minutes,
      max_threads,
      next_update_minutes,
      dry_run,
      token_override,
    }) =>
      safeToolRun(async () => {
        if (playbook === "incident_open") {
          if (!title) throw new Error("`title` is required for incident_open.");
          return createIncidentWorkflow(
            {
              channel,
              title,
              summary,
              details,
              owner,
              severity,
              next_update_minutes,
              dry_run,
              token_override,
            },
            { source: "ops_playbook_run", playbook }
          );
        }

        if (playbook === "support_digest") {
          return generateSupportDigestWorkflow(
            {
              channel,
              channels,
              report_channel,
              lookback_hours,
              sla_minutes,
              max_threads,
              dry_run,
              token_override,
            },
            { source: "ops_playbook_run", playbook }
          );
        }

        if (!title) throw new Error("`title` is required for release_broadcast.");
        if (!summary) throw new Error("`summary` is required for release_broadcast.");

        return sendBroadcastWorkflow(
          {
            channels:
              Array.isArray(channels) && channels.length > 0 ? channels : channel ? [channel] : [],
            title,
            summary,
            details,
            template_id: "release_default",
            dry_run,
            token_override,
          },
          { source: "ops_playbook_run", playbook }
        );
      })
  );

  server.registerTool(
    "ops_channel_snapshot",
    {
      description:
        "Operational snapshot for a channel: activity volume, participants, threads, reactions, and recent samples.",
      inputSchema: {
        channel: z.string().min(1),
        lookback_hours: z.number().int().min(1).max(168).optional(),
        limit: z.number().int().min(1).max(1000).optional(),
        participant_limit: z.number().int().min(1).max(20).optional(),
        sample_size: z.number().int().min(1).max(20).optional(),
        token_override: z.string().optional(),
      },
    },
    async ({
      channel,
      lookback_hours,
      limit,
      participant_limit,
      sample_size,
      token_override,
    }) =>
      safeToolRun(async () => {
        const resolvedChannel = await resolveChannelReference(channel, token_override);
        const lookbackHours = lookback_hours ?? 24;
        const oldest = String(Math.floor(Date.now() / 1000 - lookbackHours * 3600));
        const history = await callSlackApi(
          "conversations.history",
          {
            channel: resolvedChannel.id,
            oldest,
            inclusive: true,
            limit: limit ?? 200,
          },
          token_override
        );

        const messages = Array.isArray(history?.messages) ? history.messages : [];
        const summary = summarizeChannelMessages(messages, {
          participantLimit: participant_limit ?? 5,
          sampleSize: sample_size ?? 5,
        });

        return {
          channel: resolvedChannel.id,
          channel_name: resolvedChannel.name || null,
          channel_reference: resolvedChannel.reference || channel,
          lookback_hours: lookbackHours,
          has_more: Boolean(history?.has_more),
          next_cursor: history?.response_metadata?.next_cursor || null,
          ...summary,
        };
      })
  );

  server.registerTool(
    "ops_unanswered_threads",
    {
      description:
        "Find unanswered or stale question-like threads in a channel for follow-up operations.",
      inputSchema: {
        channel: z.string().min(1),
        lookback_hours: z.number().int().min(1).max(168).optional(),
        min_age_minutes: z.number().int().min(1).max(10080).optional(),
        max_threads: z.number().int().min(1).max(50).optional(),
        include_bot_replies: z.boolean().optional(),
        token_override: z.string().optional(),
      },
    },
    async ({
      channel,
      lookback_hours,
      min_age_minutes,
      max_threads,
      include_bot_replies,
      token_override,
    }) =>
      safeToolRun(async () => {
        const resolvedChannel = await resolveChannelReference(channel, token_override);
        const result = await findUnansweredThreadsInChannel({
          channel: resolvedChannel.id,
          lookbackHours: lookback_hours ?? 24,
          minAgeMinutes: min_age_minutes ?? 30,
          maxThreads: max_threads ?? 20,
          includeBotReplies: include_bot_replies === true,
          tokenOverride: token_override,
        });

        return {
          ...result,
          channel_name: resolvedChannel.name || null,
          channel_reference: resolvedChannel.reference || channel,
        };
      })
  );

  server.registerTool(
    "ops_sla_breach_scan",
    {
      description:
        "Scan multiple channels for threads that exceed an SLA threshold without external replies.",
      inputSchema: {
        channels: z.array(z.string().min(1)).min(1).max(20),
        sla_minutes: z.number().int().min(1).max(10080).optional(),
        lookback_hours: z.number().int().min(1).max(168).optional(),
        max_threads_per_channel: z.number().int().min(1).max(100).optional(),
        include_bot_replies: z.boolean().optional(),
        token_override: z.string().optional(),
      },
    },
    async ({
      channels,
      sla_minutes,
      lookback_hours,
      max_threads_per_channel,
      include_bot_replies,
      token_override,
    }) =>
      safeToolRun(async () => {
        const resolvedChannels = await resolveChannelReferences(channels, token_override);
        const slaMinutes = sla_minutes ?? 60;
        const lookbackHours = lookback_hours ?? 24;
        const maxThreadsPerChannel = max_threads_per_channel ?? 20;
        const channelSummaries = [];
        const breaches = [];

        for (const resolved of resolvedChannels) {
          const result = await findUnansweredThreadsInChannel({
            channel: resolved.id,
            lookbackHours,
            minAgeMinutes: slaMinutes,
            maxThreads: maxThreadsPerChannel,
            includeBotReplies: include_bot_replies === true,
            tokenOverride: token_override,
          });

          channelSummaries.push({
            channel: resolved.id,
            channel_name: resolved.name || null,
            scanned_candidates: result.scanned_candidates,
            unanswered_count: result.unanswered_count,
          });

          for (const thread of result.unanswered_threads) {
            breaches.push({
              ...thread,
              channel_name: resolved.name || null,
              channel_reference: resolved.reference || resolved.id,
            });
          }
        }

        breaches.sort((a, b) => Number(b.age_minutes || 0) - Number(a.age_minutes || 0));

        return {
          channels_scanned: resolvedChannels.length,
          lookback_hours: lookbackHours,
          sla_minutes: slaMinutes,
          total_breach_count: breaches.length,
          channel_summaries: channelSummaries,
          breaches,
        };
      })
  );

  server.registerTool(
    "ops_sla_followup",
    {
      description:
        "Post reminder replies to SLA-breached threads across channels (supports dry-run).",
      inputSchema: {
        channels: z.array(z.string().min(1)).min(1).max(20),
        sla_minutes: z.number().int().min(1).max(10080).optional(),
        lookback_hours: z.number().int().min(1).max(168).optional(),
        max_threads_per_channel: z.number().int().min(1).max(100).optional(),
        max_messages: z.number().int().min(1).max(200).optional(),
        include_bot_replies: z.boolean().optional(),
        reminder_text: z.string().optional(),
        dry_run: z.boolean().optional(),
        token_override: z.string().optional(),
      },
    },
    async ({
      channels,
      sla_minutes,
      lookback_hours,
      max_threads_per_channel,
      max_messages,
      include_bot_replies,
      reminder_text,
      dry_run,
      token_override,
    }) =>
      safeToolRun(async () => {
        const resolvedChannels = await resolveChannelReferences(channels, token_override);
        const slaMinutes =
          sla_minutes ?? OPERATIONS_CONFIG.followups.default_sla_minutes ?? 60;
        const lookbackHours =
          lookback_hours ?? OPERATIONS_CONFIG.followups.default_lookback_hours ?? 24;
        const maxThreadsPerChannel =
          max_threads_per_channel ??
          OPERATIONS_CONFIG.followups.default_max_threads_per_channel ??
          20;
        const maxMessages =
          max_messages ?? OPERATIONS_CONFIG.followups.default_max_messages ?? 30;
        const dryRun = dry_run !== false;
        const suppressHours = Math.max(
          1,
          Number(OPERATIONS_CONFIG.followups.suppress_hours || 6)
        );
        const defaultReminder =
          reminder_text ||
          renderTemplateText(
            OPERATIONS_CONFIG.followups.reminder_template,
            { sla_minutes: slaMinutes },
            "\n"
          );

        const breaches = [];
        for (const resolved of resolvedChannels) {
          const result = await findUnansweredThreadsInChannel({
            channel: resolved.id,
            lookbackHours,
            minAgeMinutes: slaMinutes,
            maxThreads: maxThreadsPerChannel,
            includeBotReplies: include_bot_replies === true,
            tokenOverride: token_override,
          });

          for (const thread of result.unanswered_threads) {
            breaches.push({
              ...thread,
              channel_name: resolved.name || null,
              channel_reference: resolved.reference || resolved.id,
            });
          }
        }

        breaches.sort((a, b) => Number(b.age_minutes || 0) - Number(a.age_minutes || 0));
        const state = loadOperationsState();
        const recentCutoff = Date.now() - suppressHours * 60 * 60 * 1000;
        const suppressedTargets = [];
        const eligibleTargets = [];

        for (const breach of breaches) {
          const recordKey = buildFollowupStateKey(breach.channel, breach.thread_ts);
          const existing = getOperationRecord(state, "followups", recordKey);
          const lastRemindedAt = existing?.last_reminded_at
            ? Date.parse(existing.last_reminded_at)
            : NaN;
          if (Number.isFinite(lastRemindedAt) && lastRemindedAt >= recentCutoff) {
            suppressedTargets.push({
              ...breach,
              last_reminded_at: existing.last_reminded_at,
              reminder_count: existing.reminder_count || 0,
            });
            continue;
          }
          eligibleTargets.push(breach);
        }

        const targets = eligibleTargets.slice(0, maxMessages);

        if (dryRun) {
          return {
            dry_run: true,
            lookback_hours: lookbackHours,
            sla_minutes: slaMinutes,
            total_breach_count: breaches.length,
            suppressed_due_to_recent_followup: suppressedTargets.length,
            max_messages,
            planned_messages: targets.length,
            reminder_preview: defaultReminder,
            targets,
            suppressed_targets: suppressedTargets,
          };
        }

        const campaignId = createOperationId("followup");
        const results = [];
        for (const target of targets) {
          try {
            const data = await callSlackApi(
              "chat.postMessage",
              {
                channel: target.channel,
                thread_ts: target.thread_ts,
                text: defaultReminder,
                mrkdwn: true,
              },
              token_override
            );
            results.push({
              channel: target.channel,
              channel_name: target.channel_name || null,
              thread_ts: target.thread_ts,
              ok: true,
              ts: data?.ts || null,
            });
          } catch (error) {
            results.push({
              channel: target.channel,
              channel_name: target.channel_name || null,
              thread_ts: target.thread_ts,
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }

        const successCount = results.filter((item) => item.ok).length;
        const now = new Date().toISOString();
        mutateOperationsState((mutableState) => {
          for (const target of targets) {
            const result = results.find(
              (item) => item.channel === target.channel && item.thread_ts === target.thread_ts
            );
            if (!result?.ok) continue;
            const recordKey = buildFollowupStateKey(target.channel, target.thread_ts);
            const existing = getOperationRecord(mutableState, "followups", recordKey) || {
              id: recordKey,
              channel: target.channel,
              thread_ts: target.thread_ts,
              created_at: now,
            };
            const nextRecord = {
              ...existing,
              id: recordKey,
              channel: target.channel,
              channel_name: target.channel_name || null,
              channel_reference: target.channel_reference || target.channel,
              thread_ts: target.thread_ts,
              root_text: target.root_text || existing.root_text || "",
              status: "active",
              reminder_count: Number(existing.reminder_count || 0) + 1,
              last_text: defaultReminder,
              last_campaign_id: campaignId,
              last_reminded_at: now,
              updated_at: now,
            };
            upsertOperationRecord(mutableState, "followups", nextRecord);
          }
        });

        return {
          dry_run: false,
          lookback_hours: lookbackHours,
          sla_minutes: slaMinutes,
          total_breach_count: breaches.length,
          suppressed_due_to_recent_followup: suppressedTargets.length,
          attempted_messages: targets.length,
          success_count: successCount,
          failed_count: targets.length - successCount,
          campaign_id: campaignId,
          results,
        };
      })
  );

  server.registerTool(
    "ops_broadcast_message",
    {
      description:
        "Broadcast the same operational message to multiple channels, or send a prepared broadcast draft.",
      inputSchema: {
        broadcast_id: z.string().optional(),
        channels: z.array(z.string().min(1)).min(1).max(20).optional(),
        text: z.string().optional(),
        title: z.string().optional(),
        summary: z.string().optional(),
        details: z.string().optional(),
        template_id: z.string().optional(),
        blocks: z.any().optional(),
        mrkdwn: z.boolean().optional(),
        unfurl_links: z.boolean().optional(),
        unfurl_media: z.boolean().optional(),
        dry_run: z.boolean().optional(),
        token_override: z.string().optional(),
      },
    },
    async ({
      broadcast_id,
      channels,
      text,
      title,
      summary,
      details,
      template_id,
      blocks,
      mrkdwn,
      unfurl_links,
      unfurl_media,
      dry_run,
      token_override,
    }) =>
      safeToolRun(async () =>
        sendBroadcastWorkflow({
          broadcast_id,
          channels,
          text,
          title,
          summary,
          details,
          template_id,
          blocks,
          mrkdwn,
          unfurl_links,
          unfurl_media,
          dry_run,
          token_override,
        })
      )
  );

  server.registerTool(
    "ops_audit_log_read",
    {
      description:
        "Read recent local audit log entries for governance and troubleshooting.",
      inputSchema: {
        limit: z.number().int().min(1).max(500).optional(),
        event: z.string().optional(),
        method: z.string().optional(),
      },
    },
    async ({ limit, event, method }) =>
      safeToolRun(async () => {
        const effectiveLimit = limit ?? 100;
        const entries = safeReadAuditEntries(effectiveLimit, {
          event: event || "",
          method: method || "",
        });
        return {
          audit_enabled: ENABLE_AUDIT_LOG,
          audit_path: AUDIT_LOG_PATH,
          requested_limit: effectiveLimit,
          count: entries.length,
          entries,
        };
      })
  );

  return { registered: 14 };
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
        const auth = getAuthStatusSummary();
        return {
          catalog_path: CATALOG_PATH,
          execution_mode: runtimeGateway.url ? "gateway" : "local",
          auth: {
            ready: auth.ready,
            mode: auth.mode,
            summary: auth.summary,
          },
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
          method_policy: {
            allowlist: [...METHOD_ALLOWLIST.values()],
            denylist: [...METHOD_DENYLIST.values()],
            allow_prefixes: METHOD_ALLOW_PREFIXES,
            deny_prefixes: METHOD_DENY_PREFIXES,
          },
          audit: {
            enabled: ENABLE_AUDIT_LOG,
            path: AUDIT_LOG_PATH,
          },
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
  let gatewayStats = { registered: 0 };
  const opsStats = registerOperationsTools(server);

  if (TOOL_EXPOSURE_MODE === "legacy") {
    coreStats = registerCoreTools(server);
  } else if (TOOL_EXPOSURE_MODE === "developer") {
    gatewayStats = registerSmartGatewayTools(server, catalog);
    if (SMART_COMPAT_CORE_TOOLS) {
      coreStats = registerCoreTools(server);
    }
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
    `[${SERVER_NAME}] connected via stdio | mode=${TOOL_EXPOSURE_MODE} | ops_tools_registered=${opsStats.registered} | gateway_tools_registered=${gatewayStats.registered} | raw_core_tools_registered=${coreStats?.registered ?? 0} | catalog_methods=${catalogCount} | method_tools_registered=${methodStats.registered}`
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
  if (command === "gateway") {
    await runGatewayCompatCli(rest);
    return;
  }
  if (command === "help" || command === "--help" || command === "-h") {
    console.log("Usage:");
    console.log("  slack-max-api-mcp");
    console.log("  slack-max-api-mcp oauth <login|list|use|current|help>");
    console.log("  slack-max-api-mcp onboard <run|help>");
    console.log("  slack-max-api-mcp onboard-server <start|help>");
    console.log("  slack-max-api-mcp gateway <start|help>  # deprecated alias");
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
