#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
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
const DEFAULT_SLACK_TOKEN =
  process.env.SLACK_BOT_TOKEN ||
  process.env.SLACK_USER_TOKEN ||
  process.env.SLACK_TOKEN ||
  FIXED_BOT_TOKEN ||
  FIXED_USER_TOKEN ||
  FIXED_GENERIC_TOKEN;

function requireSlackToken(tokenOverride) {
  const token = tokenOverride || DEFAULT_SLACK_TOKEN;
  if (!token) {
    throw new Error(
      "Slack token is missing. Set SLACK_BOT_TOKEN/SLACK_USER_TOKEN/SLACK_TOKEN or fill .env.example."
    );
  }
  return token;
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

async function callSlackApi(method, params = {}, tokenOverride) {
  const token = requireSlackToken(tokenOverride);
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
    throw new Error(`Slack API HTTP ${response.status} for ${method}: ${data.error || "unknown_error"}`);
  }

  if (!data.ok) {
    throw new Error(`Slack method ${method} failed: ${data.error || "unknown_error"}`);
  }

  return data;
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
        const token = requireSlackToken(token_override);
        const method = http_method || "GET";

        const endpoint = new URL(url);
        for (const [k, v] of Object.entries(toRecordObject(query))) {
          if (v === undefined || v === null) continue;
          endpoint.searchParams.set(k, String(v));
        }

        const reqHeaders = {
          Authorization: `Bearer ${token}`,
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
      safeToolRun(async () => ({
        catalog_path: CATALOG_PATH,
        method_tools_enabled: ENABLE_METHOD_TOOLS,
        max_method_tools: MAX_METHOD_TOOLS,
        methods_in_catalog: methods.length,
        method_tools_registered: registered,
        method_tool_prefix: METHOD_TOOL_PREFIX,
      }))
  );

  return { registered };
}

async function main() {
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

main().catch((error) => {
  console.error(`[${SERVER_NAME}] fatal error:`, error);
  process.exit(1);
});
