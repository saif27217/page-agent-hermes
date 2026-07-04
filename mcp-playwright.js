#!/usr/bin/env node
"use strict";

// page-agent-hermes — Playwright MCP stdio server with built-in ReAct loop
//
// Tools:
//   browser_navigate, browser_click, browser_type, browser_evaluate,
//   browser_screenshot, browser_status, browser_close  — manual tools
//   agent_execute  — ReAct loop + reflection: give it a task + URL, it loops

const { chromium } = require("playwright");
const readline = require("readline");

// ─── State ────────────────────────────────────────────────────────────────
let browser = null;
let context = null;
let page = null;

function readEnvFile(path) {
  try {
    const fs = require("fs");
    const data = fs.readFileSync(path, "utf8");
    const env = {};
    for (const line of data.split("\n")) {
      const m = line.match(/^\s*(\w+)\s*=\s*(.*?)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
    return env;
  } catch { return {}; }
}

const hermesEnv = readEnvFile(require("path").join(process.env.HOME || "/home/sak", ".hermes", ".env"));

const CONFIG = {
  model: process.env.OPENROUTER_MODEL || hermesEnv.OPENROUTER_MODEL || "mimo-v2.5",
  apiKey: process.env.OPENROUTER_API_KEY || hermesEnv.OPENROUTER_API_KEY || "",
  apiBase: (process.env.OPENROUTER_API_BASE || hermesEnv.OPENROUTER_API_BASE || "https://openrouter.ai/api/v1").replace(/\/+$/, ""),
};

const MAX_STEPS = 14;
const ELEM_LIMIT = 40;

// ─── Browser helpers ──────────────────────────────────────────────────────
async function ensureBrowser() {
  if (browser && context && page && !page.isClosed()) return;
  browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-blink-features=AutomationControlled",
      "--disable-infobars",
      "--no-first-run",
      "--no-default-browser-check",
    ],
  });
  context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 900 },
    locale: "en-US",
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    window.chrome = { runtime: {} };
    Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] });
    Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
  });
  page = await context.newPage();
}

async function closeBrowser() {
  try {
    if (page && !page.isClosed()) { await page.close(); page = null; }
    if (context) { await context.close(); context = null; }
    if (browser) { await browser.close(); browser = null; }
  } catch {}
}

async function safeGoto(url) {
  await ensureBrowser();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  } catch (e) {
    return { error: `Navigation failed: ${e.message}` };
  }
  return { ok: true };
}

// ─── Stable selector injection ────────────────────────────────────────────
// Injects data-pa-idx onto interactive elements so the agent can reference them
// by index without fragile CSS paths.
async function buildSelectorMap() {
  return await page.evaluate((limit) => {
    const INTERACTIVE = [
      "a[href]",
      "button",
      "input:not([type=hidden]):not([type=submit]):not([type=button])",
      "input[type=submit],input[type=button],input[type=checkbox],input[type=radio]",
      "select",
      "textarea",
      "[role='button']",
      "[role='link']",
      "[tabindex]:not([tabindex='-1'])",
      "[contenteditable='true']",
      "summary",
    ];

    const seen = new Set();
    let idx = 0;
    const map = [];

    for (const sel of INTERACTIVE) {
      const nodes = document.querySelectorAll(sel);
      for (const el of nodes) {
        if (idx >= limit) break;
        // Skip invisible elements
        if (el.offsetParent === null && !(el.tagName === "SUMMARY" || el.tagName === "DETAILS")) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        const key = (el.tagName + "|" + (el.href || el.textContent?.trim()?.slice(0, 30) || el.placeholder || el.ariaLabel || el.innerHTML?.slice(0, 20) || "")).slice(0, 120);
        if (seen.has(key)) continue;
        seen.add(key);

        let text = "";
        if (el.innerText && el.innerText.trim()) text = el.innerText.trim();
        else if (el.ariaLabel) text = el.ariaLabel;
        else if (el.placeholder) text = el.placeholder;
        else if (el.title) text = el.title;
        else if (el.alt) text = el.alt;

        el.setAttribute("data-pa-idx", String(idx));
        map.push({
          index: idx,
          tag: el.tagName.toLowerCase(),
          text: text.slice(0, 80),
        });
        idx++;
      }
      if (idx >= limit) break;
    }
    return map;
  }, ELEM_LIMIT);
}

async function observe() {
  await ensureBrowser();
  const map = await buildSelectorMap();
  const pageInfo = await page.evaluate(() => ({
    title: document.title || "",
    url: document.location.href || "",
    text: (document.body?.innerText || "").slice(0, 12000),
    cf: document.body?.innerText?.toLowerCase().includes("cloudflare") ||
        document.querySelector("[id*='cf-chl-widget']") !== null ||
        document.querySelector("[class*='challenge']") !== null ||
        document.querySelector("title")?.textContent?.toLowerCase().includes("cloudflare") || false,
  }));
  return { pageInfo, map };
}

// ─── LLM helper (OpenRouter-compatible) ───────────────────────────────────
async function callLLM(messages, tools) {
  if (!CONFIG.apiKey) throw new Error("No OPENROUTER_API_KEY configured");

  const body = {
    model: CONFIG.model,
    messages,
    tools,
    parallel_tool_calls: false,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    var resp = await fetch(`${CONFIG.apiBase}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CONFIG.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally { clearTimeout(timeout); }

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`LLM ${resp.status}: ${err.slice(0, 200)}`);
  }

  const data = await resp.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  if (!data.choices?.length) throw new Error("Empty LLM response");
  return data.choices[0].message;
}

// ─── ReAct ─────────────────────────────────────────────────────────────────
const AGENT_TOOLS = [
  {
    type: "function",
    function: {
      name: "click",
      description: `Click an interactive element by its index in the selector map. Index range: 0 to ${ELEM_LIMIT - 1}.`,
      parameters: {
        type: "object",
        properties: {
          index: { type: "integer", minimum: 0, maximum: ELEM_LIMIT - 1 },
        },
        required: ["index"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "type",
      description: "Type text into an input field by its index in the selector map.",
      parameters: {
        type: "object",
        properties: {
          index: { type: "integer", minimum: 0, maximum: ELEM_LIMIT - 1 },
          text: { type: "string" },
        },
        required: ["index", "text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "scroll",
      description: "Scroll the page to reveal more content.",
      parameters: {
        type: "object",
        properties: {
          direction: { type: "string", enum: ["down", "up"] },
        },
        required: ["direction"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "done",
      description: "Mark the task as complete. Summarize your final result.",
      parameters: {
        type: "object",
        properties: {
          summary: { type: "string" },
        },
        required: ["summary"],
      },
    },
  },
];

const AGENT_SYSTEM_PROMPT = `You are a web browsing agent. Complete the user's task by taking ONE tool call per step.

CRITICAL: If the URL contains a #anchor like #section_name or #Medical_uses, the content the user wants is ALREADY on screen. Do NOT scroll. Read the provided body text and put the actual answer in 'done'. 

If after 1-2 scroll steps everything needed is visible, call 'done' with full extracted content rather than continuing to scroll.

When calling 'done':
 - PUT THE ACTUAL ANSWER in summary — quote exact numbers/phrases from the page text, e.g. "CrCl 20-49: 500 mg every other day"
 - Do NOT say "I found the information" — write the actual data
 - Do NOT say "the page is accessible" — write what the page says

Observation format (JSON):
 - pageInfo.text — first 12 KB of innerText (enough for full table data)
 - pageInfo.cf — true if Cloudflare challenge detected (if true, call done with the Cloudflare message)
 - elements — up to 40 indexed interactive elements (links, buttons, inputs)

Tool rules:
 - click index=N — clicks element data-pa-idx=N from the selector map
 - type index=N text="..." — fills element N
 - scroll down/up
 - done summary="..." — only when task fully answered

Heuristics:
 - 1 scroll reveals ~1 viewport; 3-4 scrolls traverse the full page
 - After finding the target section, call done — do NOT keep exploring
 - The text provided in pageInfo.text is usually the whole page body — search it directly before scrolling`;

async function agentExecuteTask({ instruction, url }) {
  await ensureBrowser();

  if (url) {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(1000);
  }

  const history = [];
  let step = 0;
  let doneSummary = "";
  let error = "";
  let sameActionFails = 0;
  let lastActionKey = "";

  while (step < MAX_STEPS) {
    // ── Observe ──────────────────────────────────────────────────────
    let obs;
    try {
      obs = await observe();
    } catch (e) {
      error = `Observe failed: ${e.message}`;
      break;
    }

    if (obs.pageInfo.cf) {
      return {
        steps: step,
        summary: `BLOCKED: Cloudflare challenge detected on ${obs.pageInfo.url}. Task cannot proceed via headless Playwright. Use Hermes native browser tools (browser_navigate + browser_snapshot) to complete this task manually — they go through Browserbase which bypasses Cloudflare. Raw page title: "${obs.pageInfo.title}"`,
        error: "Cloudflare blocked headless chromium",
        finalUrl: obs.pageInfo.url,
        finalTitle: obs.pageInfo.title,
        cloudflare_blocked: true,
      };
      console.error("[page-agent-hermes] CF_BLOCK", JSON.stringify(result).slice(0, 200));
      return result;
    }

    const obsText = JSON.stringify({
      title: obs.pageInfo.title,
      url: obs.pageInfo.url,
      text: obs.pageInfo.text.slice(0, 10000),
      cloudflare_blocked: !!obs.pageInfo.cf,
      elements: obs.map.slice(0, ELEM_LIMIT),
    });

    const messages = [
      { role: "system", content: AGENT_SYSTEM_PROMPT },
      ...history,
      {
        role: "user",
        content: `Task: ${instruction}\n\nCurrent page (step ${step}):\n${obsText}`,
      },
    ];

    // ── Think / Reflect / Act ─────────────────────────────────────────
    let msg;
    try {
      msg = await callLLM(messages, AGENT_TOOLS);
    } catch (e) {
      error = `LLM error at step ${step}: ${e.message}`;
      break;
    }

    const toolCalls = msg.tool_calls;
    if (!toolCalls || !toolCalls.length) {
      doneSummary = msg.content || "No tool call returned";
      break;
    }

    const call = toolCalls[0];
    let args = {};
    try {
      args = JSON.parse(call.function.arguments);
    } catch {
      history.push({ role: "assistant", content: `(bad args JSON from LLM: ${call.function.arguments.slice(0, 100)})` });
      step++;
      continue;
    }

    // ── Act ────────────────────────────────────────────────────────
    if (call.function.name === "done") {
      doneSummary = args.summary || "Task complete";
      break;
    }

    // Track repeated actions for stuck detection
    const actionKey = `${call.function.name}:${JSON.stringify(args)}`;
    if (actionKey === lastActionKey) { sameActionFails++; } else { sameActionFails = 0; lastActionKey = actionKey; }

    if (sameActionFails >= 3) {
      // Stuck — force read from page text and done
      const stuckText = await page.evaluate(() => (document.body?.innerText || "").slice(0, 8000));
      doneSummary = `(ReAct stuck on same action after 3 attempts) Page text at ${page.url()}:\n${stuckText.slice(0, 3000)}`;
      break;
    }

    if (call.function.name === "scroll") {
      try {
        await page.evaluate(args.direction === "down"
          ? "window.scrollBy(0, window.innerHeight)"
          : "window.scrollBy(0, -window.innerHeight)");
        history.push({ role: "assistant", content: `scrolled ${args.direction}` });
      } catch (e) {
        history.push({ role: "assistant", content: `scroll error: ${e.message.slice(0,80)}` });
      }
    } else if (call.function.name === "click") {
      const idx = args.index;
      const el = obs.map[idx];
      if (!el) {
        history.push({ role: "assistant", content: `invalid index ${idx}` });
        step++;
        continue;
      }
      try {
        await page.click(`[data-pa-idx="${idx}"]`, { timeout: 5_000 });
        await page.waitForTimeout(800);
        history.push({ role: "assistant", content: `clicked [${idx}] ${el.tag} "${el.text.slice(0,40)}"` });
      } catch (e) {
        history.push({ role: "assistant", content: `click [${idx}] failed: ${e.message.slice(0,100)}` });
      }
    } else if (call.function.name === "type") {
      const idx = args.index;
      const el = obs.map[idx];
      if (!el) {
        history.push({ role: "assistant", content: `invalid index ${idx}` });
        step++;
        continue;
      }
      try {
        await page.fill(`[data-pa-idx="${idx}"]`, args.text, { timeout: 5_000 });
        history.push({ role: "assistant", content: `typed into [${idx}]: "${String(args.text).slice(0,50)}"` });
      } catch (e) {
        history.push({ role: "assistant", content: `type [${idx}] failed: ${e.message.slice(0,100)}` });
      }
    } else {
      history.push({ role: "assistant", content: `unknown tool ${call.function.name}` });
    }

    await page.waitForTimeout(300);
    step++;
  }

  const finalPage = await page.evaluate(() => ({ title: document.title, url: document.location?.href || "" })).catch(() => ({}));

  const result = {
    steps: step,
    summary: doneSummary || error || "No conclusion (max steps reached)",
    error: error || "",
    finalUrl: finalPage.url || "",
    finalTitle: finalPage.title || "",
  };
  return result;
}

// ─── Manual tools (unchanged from previous version) ──────────────────────
// ─── Manual tools (unchanged from previous version) ──────────────────────
const MANUAL_TOOLS = {
  browser_navigate: {
    description: "Navigate to a URL",
    inputSchema: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
    async handler({ url }) {
      await ensureBrowser();
      const ret = await safeGoto(url);
      if (ret.error) return ret;
      return { title: await page.title(), url: page.url() };
    },
  },

  browser_snapshot: {
    description: "Return full HTML snapshot of the current page (first ~50KB)",
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
    description: "Click an element on the page by CSS selector",
    inputSchema: { type: "object", properties: { selector: { type: "string" } }, required: ["selector"] },
    async handler({ selector }) {
      await ensureBrowser();
      try {
        await page.click(selector, { timeout: 5_000 });
        await page.waitForTimeout(500);
        return { ok: true };
      } catch (e) {
        return { error: e.message };
      }
    },
  },

  browser_type: {
    description: "Type text into an input field",
    inputSchema: { type: "object", properties: { selector: { type: "string" }, text: { type: "string" } }, required: ["selector", "text"] },
    async handler({ selector, text }) {
      await ensureBrowser();
      try {
        await page.fill(selector, text, { timeout: 5_000 });
        return { ok: true };
      } catch (e) {
        return { error: e.message };
      }
    },
  },

  browser_evaluate: {
    description: "Execute JavaScript in the page context",
    inputSchema: { type: "object", properties: { expression: { type: "string" } }, required: ["expression"] },
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
    inputSchema: { type: "object", properties: { fullPage: { type: "boolean" } } },
    async handler({ fullPage = false }) {
      await ensureBrowser();
      try {
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
    description: "Check browser state",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      if (!browser || !page || page.isClosed()) return { running: false };
      return { running: true, url: page.url(), title: await page.title().catch(() => "") };
    },
  },
};

const ALL_TOOLS = { ...MANUAL_TOOLS, agent_execute: undefined };

Object.defineProperty(ALL_TOOLS, "agent_execute", {
  value: {
    description: `High-level ReAct agent. Give it an instruction and optional start URL; it autonomously clicks, types, and scrolls up to ${MAX_STEPS} steps using LLM reasoning. Use this for multi-step tasks.`,
    inputSchema: {
      type: "object",
      properties: {
        instruction: { type: "string", description: "Natural language task for the agent" },
        url: { type: "string", description: "Optional start URL" },
      },
      required: ["instruction"],
    },
    handler: agentExecuteTask,
  },
  writable: false,
});

// ─── MCP stdio protocol ───────────────────────────────────────────────────
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });

async function handleMessage(msg) {
  const id = msg.id;
  const isNotification = id === undefined || id === null;

  if (msg.method === "initialize") {
    return send({ id, result: {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "page-agent-hermes", version: "1.1.0" },
    }});
  }

  // Notifications — no response expected
  if (isNotification) return;

  if (msg.method === "tools/list") {
    return send({ id, result: {
      tools: Object.entries(ALL_TOOLS).filter(([_, v]) => v).map(([name, t]) => ({
        name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    }});
  }

  if (msg.method === "tools/call") {
    const tool = ALL_TOOLS[msg.params.name];
    if (!tool) return sendError(id, -32601, `Unknown tool: ${msg.params.name}`);
    try {
      const resp = await tool.handler(msg.params.arguments || {});
      return send({ id, result: { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] } });
    } catch (e) {
      return sendError(id, -32603, e.message);
    }
  }

  return sendError(id, -32601, `Unknown method: ${msg.method}`);
}

function send(msg) { process.stdout.write(JSON.stringify({ ...msg, jsonrpc: "2.0" }) + "\n"); }
function sendError(id, code, message) { send({ id, error: { code, message } }); }

rl.on("line", (line) => {
  if (!line.trim()) return;
  try {
    const msg = JSON.parse(line);
    handleMessage(msg).catch((e) => {
      if (msg.id != null) sendError(msg.id, -32603, e.message);
    });
  } catch {}
});

process.on("SIGINT", async () => { await closeBrowser(); process.exit(0); });
process.on("SIGTERM", async () => { await closeBrowser(); process.exit(0); });
