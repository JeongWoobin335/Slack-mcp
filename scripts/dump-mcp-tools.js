#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");

function parseArgs(argv) {
  const out = {
    outFile: path.join(process.cwd(), ".tmp_tools_list.json"),
    disableMethodTools: false,
    enableMethodTools: false,
    maxMethodTools: null,
    exposureMode: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--out" && argv[i + 1]) {
      out.outFile = path.resolve(process.cwd(), argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === "--disable-method-tools") {
      out.disableMethodTools = true;
      continue;
    }
    if (arg === "--enable-method-tools") {
      out.enableMethodTools = true;
      continue;
    }
    if (arg === "--max-method-tools" && argv[i + 1]) {
      out.maxMethodTools = Number(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === "--exposure-mode" && argv[i + 1]) {
      out.exposureMode = String(argv[i + 1]).trim().toLowerCase();
      i += 1;
      continue;
    }
  }

  return out;
}

async function listAllTools(client) {
  const tools = [];
  let cursor = undefined;

  while (true) {
    const res = await client.listTools(cursor ? { cursor } : undefined);
    if (Array.isArray(res.tools)) {
      tools.push(...res.tools);
    }

    if (!res.nextCursor) break;
    cursor = res.nextCursor;
  }

  return tools;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rootDir = process.cwd();
  const serverPath = path.join(rootDir, "src", "slack-mcp-server.js");

  const env = {
    ...process.env,
    SLACK_AUTO_ONBOARD: "false",
  };

  if (args.disableMethodTools && args.enableMethodTools) {
    throw new Error("Use either --enable-method-tools or --disable-method-tools, not both.");
  }
  if (args.enableMethodTools) {
    env.SLACK_ENABLE_METHOD_TOOLS = "true";
  } else if (args.disableMethodTools) {
    env.SLACK_ENABLE_METHOD_TOOLS = "false";
  }
  if (Number.isFinite(args.maxMethodTools) && args.maxMethodTools >= 0) {
    env.SLACK_MAX_METHOD_TOOLS = String(args.maxMethodTools);
  }
  if (args.exposureMode === "smart" || args.exposureMode === "legacy") {
    env.SLACK_TOOL_EXPOSURE_MODE = args.exposureMode;
  }

  const client = new Client(
    {
      name: "mcp-tools-dumper",
      version: "1.0.0",
    },
    { capabilities: {} }
  );

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    cwd: rootDir,
    env,
    stderr: "pipe",
  });

  if (transport.stderr) {
    transport.stderr.on("data", () => {
      // Ignore server stderr to keep output deterministic for scripting.
    });
  }

  try {
    await client.connect(transport);

    const tools = await listAllTools(client);
    const payload = {
      measured_at: new Date().toISOString(),
      cwd: rootDir,
      options: {
        exposure_mode: args.exposureMode,
        enable_method_tools: args.enableMethodTools,
        disable_method_tools: args.disableMethodTools,
        max_method_tools: args.maxMethodTools,
      },
      tool_count: tools.length,
      tools,
    };

    fs.writeFileSync(args.outFile, JSON.stringify(payload, null, 2), "utf8");
    console.log(JSON.stringify({ ok: true, out_file: args.outFile, tool_count: tools.length }));
  } finally {
    try {
      await transport.close();
    } catch {
      // no-op
    }
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: String(error?.message || error) }));
  process.exit(1);
});
