#!/usr/bin/env node
"use strict";

// page-agent-hermes — Playwright MCP stdio server
// Bridges Hermes Agent to a headless Chromium instance via the Model Context Protocol.
// LLM-agnostic; tested with mimo-v2.5 via OpenRouter.
//
// Usage:
//   node mcp-playwright.js
//
// Env vars:
//   OPENROUTER_API_KEY  (optional — available to tools if they need to call an LLM)
//   OPENROUTER_MODEL    (default: mimo-v2.5)
//   OPENROUTER_API_BASE (default: https://openrouter.ai/api/v1)
//
// Hermes config (config.yaml):
//   mcp_servers:
//     page-agent:
//       command: node
//       args:
//         - /path/to/mcp-playwright.js
//       env:
//         OPENROUTER_API_KEY: ${OPENROUTER_API_KEY}
//         OPENROUTER_MODEL: mimo-v2.5
//         OPENROUTER_API_BASE: https://openrouter.ai/api/v1
//       enabled: true
//
// Prereqs:
//   npm install playwright
//   npx playwright install chromium

const { chromium } = require("playwright");
const readline = require("readline");

// ─── State ────────────────────────────────────────────────────────────────
let browser = null;
let context = null;
let page = null;

const CONFIG = {
  model: process.env.OPENROUTER_MODEL || "mimo-v2.5",
  apiKey: process.env.OPENROUTER_API_KEY || "",
  apiBase: process.env.OPENROUTER_API_BASE || "https://openrouter.ai/api/v1",
};

// ─── Browser lifecycle ────────────────────────────────────────────────────
async function ensureBrowser() {
  if (browser && context && page && !page.isClosed()) return;
  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 900 },
  });
  page = await context.newPage();
}

async function closeBrowser() {
  try {
    if (page && !page.isClosed()) { await page.close(); }
    page = null;
    if (context) { await context.close(); }
    context = null;
    if (browser) { await browser.close(); }
    browser = null;
  } catch {}
}

// ─── Tool handlers ────────────────────────────────────────────────────────
const TOOLS = {
  browser_navigate: {
    description: "Navigate the browser to a URL",
    inputSchema: {
      type: "object",
      properties: { url: { type: "string", description: "Full URL including scheme" } },
      required: ["url"],
    },
    async handler({ url }) {
      await ensureBrowser();
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
      return {
        title: await page.title(),
        url: page.url(),
      };
    },
  },

  browser_snapshot: {
    description: "Return the full accessibility-tree snapshot of the current page (interactive elements with ref IDs)",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      await ensureBrowser();
      const html = await page.evaluate(() => document.documentElement.outerHTML.slice(0, 50_000));
      const title = await page.title();
      const url = page.url();
      return { title, url, html_preview: html };
    },
  },

  browser_click: {
    description: "Click a page element by CSS selector",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector" },
        waitMs: { type: "number", description: "ms to wait after click (default 500)" },
      },
      required: ["selector"],
    },
    async handler({ selector, waitMs = 500 }) {
      await ensureBrowser();
      try {
        await page.click(selector, { timeout: 5_000 });
        await page.waitForTimeout(waitMs);
        return { ok: true };
      } catch (e) {
        return { error: e.message };
      }
    },
  },

  browser_type: {
    description: "Type text into an input field",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string" },
        text: { type: "string" },
        clear: { type: "boolean" },
      },
      required: ["selector", "text"],
    },
    async handler({ selector, text, clear = true }) {
      await ensureBrowser();
      try {
        if (clear) await page.fill(selector, "");
        await page.fill(selector, text);
        return { ok: true };
      } catch (e) {
        return { error: e.message };
      }
    },
  },

  browser_evaluate: {
    description: "Execute JavaScript in the page context (return value must be JSON-serialisable)",
    inputSchema: {
      type: "object",
      properties: { expression: { type: "string", description: "JavaScript expression" } },
      required: ["expression"],
    },
    async handler({ expression }) {
      await ensureBrowser();
      try {
        const result = await page.evaluate(expression);
        return { result: JSON.stringify(result).slice(0, 50_000) };
      } catch (e) {
        return { error: e.message };
      }
    },
  },

  browser_screenshot: {
    description: "Take a screenshot of the current page",
    inputSchema: {
      type: "object",
      properties: {
        fullPage: { type: "boolean" },
        path: { type: "string", description: "Optional local file path to save" },
      },
    },
    async handler({ fullPage = false, path }) {
      await ensureBrowser();
      try {
        if (path) {
          await page.screenshot({ path, fullPage });
          return { ok: true, path };
        }
        const buf = await page.screenshot({ fullPage });
        return { ok: true, bytes: buf.length, base64: buf.toString("base64") };
      } catch (e) {
        return { error: e.message };
      }
    },
  },

  browser_close: {
    description: "Close the browser instance",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      await closeBrowser();
      return { ok: true };
    },
  },

  browser_status: {
    description: "Check browser state (running, current URL, page title)",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      if (!browser || !page || page.isClosed()) return { running: false };
      return { running: true, url: page.url(), title: await page.title().catch(() => "") };
    },
  },
};

// ─── MCP stdio protocol ───────────────────────────────────────────────────
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });

async function handleMessage(msg) {
  const id = msg.id;

  if (msg.method === "initialize") {
    return send({ id, result: {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "page-agent-hermes", version: "1.0.0" },
    }});
  }

  if (msg.method === "tools/list") {
    return send({ id, result: {
      tools: Object.entries(TOOLS).map(([name, t]) => ({
        name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    }});
  }

  if (msg.method === "tools/call") {
    const tool = TOOLS[msg.params.name];
    if (!tool) return sendError(id, -32601, `Unknown tool: ${msg.params.name}`);
    try {
      const resp = await tool.handler(msg.params.arguments || {});
      return send({ id, result: { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] } });
    } catch (e) {
      return sendError(id, -32603, e.message);
    }
  }

  if (msg.method === "initialized") {
    return send({ id, result: {} });
  }

  return sendError(id, -32601, `Unknown method: ${msg.method}`);
}

function send(msg) { process.stdout.write(JSON.stringify(msg) + "\n"); }
function sendError(id, code, message) { send({ id, error: { code, message } }); }

rl.on("line", (line) => {
  if (!line.trim()) return;
  try {
    handleMessage(JSON.parse(line)).catch((e) => sendError(null, -32603, e.message));
  } catch {}
});

process.on("SIGINT", async () => { await closeBrowser(); process.exit(0); });
process.on("SIGTERM", async () => { await closeBrowser(); process.exit(0); });
