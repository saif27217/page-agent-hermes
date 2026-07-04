#!/usr/bin/env node
"use strict";
// test-agent-execute.js — Test the page-agent-hermes agent_execute tool

const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

// Read the API key from .hermes/.env
function readKey() {
  try {
    const data = fs.readFileSync(path.join(process.env.HOME, ".hermes", ".env"), "utf8");
    for (const line of data.split("\n")) {
      const m = line.match(/^\s*OPENROUTER_API_KEY\s*=\s*(.*?)\s*$/);
      if (m) return m[1].replace(/^["']|["']$/g, "");
    }
  } catch {}
  return process.env.OPENROUTER_API_KEY || "";
}

const API_KEY = readKey();
const MODEL = process.env.OPENROUTER_MODEL || "mimo-v2.5";
const BASE = (process.env.OPENROUTER_API_BASE || "https://openrouter.ai/api/v1").replace(/\/+$/, "");

console.log(`Model: ${MODEL}`);
console.log(`API Base: ${BASE}`);
console.log(`API Key set: ${!!API_KEY}`);
console.log("");

// Tools the ReAct loop can call
const AGENT_TOOLS = [
  { type: "function", function: { name: "click", description: "Click an interactive element by its index", parameters: { type: "object", properties: { index: { type: "integer", minimum: 0, maximum: 39 } }, required: ["index"] } } },
  { type: "function", function: { name: "type", description: "Type text into an input field by its index", parameters: { type: "object", properties: { index: { type: "integer", minimum: 0, maximum: 39 }, text: { type: "string" } }, required: ["index", "text"] } } },
  { type: "function", function: { name: "scroll", description: "Scroll the page", parameters: { type: "object", properties: { direction: { type: "string", enum: ["down", "up"] } }, required: ["direction"] } } },
  { type: "function", function: { name: "done", description: "Mark task complete with summary", parameters: { type: "object", properties: { summary: { type: "string" } }, required: ["summary"] } } },
];

const AGENT_SYSTEM_PROMPT = `You are a web browsing agent. Complete the user's task.`;
const MAX_STEPS = 14;
const ELEM_LIMIT = 40;

async function test(instruction, url) {
  console.log(`\n═══════════════════════════════════════`);
  console.log(`TEST: ${instruction}`);
  console.log(`URL: ${url}`);
  console.log(`═══════════════════════════════════════\n`);

  // Launch browser
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const ctx = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 900 },
  });
  const page = await ctx.newPage();

  // Navigate
  console.log(`Navigating to ${url}...`);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(e => { console.error(`Nav failed: ${e.message}`); });
  await page.waitForTimeout(1000);
  console.log(`Loaded: ${await page.title()}`);

  // Main ReAct loop
  let step = 0;
  let result = { steps: 0, summary: "", error: "", finalUrl: "", finalTitle: "" };

  while (step < MAX_STEPS) {
    // Observe
    const text = await page.evaluate(() => (document.body?.innerText || "").slice(0, 12000));
    const map = await page.evaluate((limit) => {
      const sel = ["a[href]", "button", "input:not([type=hidden])", "select", "textarea", "[role='button']", "[role='link']"];
      const seen = new Set();
      let idx = 0;
      const map = [];
      for (const s of sel) {
        const nodes = document.querySelectorAll(s);
        for (const el of nodes) {
          if (idx >= limit) break;
          const key = (el.tagName + "|" + (el.href || el.textContent?.trim()?.slice(0, 30) || "")).slice(0, 120);
          if (seen.has(key)) continue;
          seen.add(key);
          let t = el.innerText?.trim() || el.ariaLabel || el.placeholder || "";
          el.setAttribute("data-pa-idx", String(idx));
          map.push({ index: idx, tag: el.tagName.toLowerCase(), text: t.slice(0, 80) });
          idx++;
        }
        if (idx >= limit) break;
      }
      return map;
    }, ELEM_LIMIT);

    const title = await page.title();
    const currentUrl = page.url();

    console.log(`\n--- Step ${step} ---`);
    console.log(`Title: ${title}`);
    console.log(`URL: ${currentUrl}`);
    console.log(`Elements: ${map.length}`);

    // Call LLM
    const obsJson = JSON.stringify({ title, url: currentUrl, text: text.slice(0, 10000), elements: map.slice(0, ELEM_LIMIT) });
    const messages = [
      { role: "system", content: AGENT_SYSTEM_PROMPT },
      { role: "user", content: `Task: ${instruction}\n\nCurrent page (step ${step}):\n${obsJson}` },
    ];

    console.log(`Calling LLM...`);
    const llmResp = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
      body: JSON.stringify({ model: MODEL, messages, tools: AGENT_TOOLS, parallel_tool_calls: false }),
    });

    if (!llmResp.ok) {
      const err = await llmResp.text();
      result.error = `LLM ${llmResp.status}: ${err.slice(0, 200)}`;
      break;
    }

    const data = await llmResp.json();
    if (data.error) { result.error = `LLM error: ${data.error.message}`; break; }
    if (!data.choices?.length) { result.error = "Empty LLM response"; break; }

    const msg = data.choices[0].message;
    const toolCalls = msg.tool_calls;

    if (!toolCalls || !toolCalls.length) {
      result.summary = msg.content || "No tool call returned";
      console.log(`LLM said: ${(msg.content || "").slice(0, 200)}`);
      break;
    }

    const call = toolCalls[0];
    let args = {};
    try { args = JSON.parse(call.function.arguments); } catch { step++; continue; }

    console.log(`Tool: ${call.function.name} ${JSON.stringify(args)}`);

    // Execute
    if (call.function.name === "done") {
      result.summary = args.summary || "Task complete";
      console.log(`\n*** DONE: ${result.summary} ***`);
      break;
    } else if (call.function.name === "scroll") {
      await page.evaluate(args.direction === "down" ? "window.scrollBy(0, window.innerHeight)" : "window.scrollBy(0, -window.innerHeight)");
      console.log(`Scrolled ${args.direction}`);
    } else if (call.function.name === "click") {
      const idx = args.index;
      try {
        await page.click(`[data-pa-idx="${idx}"]`, { timeout: 5000 });
        await page.waitForTimeout(800);
        const el = map[idx];
        console.log(`Clicked [${idx}] ${el ? el.text : "?"}`);
      } catch (e) { console.log(`Click [${idx}] failed: ${e.message}`); }
    } else if (call.function.name === "type") {
      try { await page.fill(`[data-pa-idx="${args.index}"]`, args.text, { timeout: 5000 }); console.log(`Typed into [${args.index}]`); }
      catch (e) { console.log(`Type failed: ${e.message}`); }
    }

    await page.waitForTimeout(300);
    step++;
  }

  result.steps = step;
  result.finalUrl = page.url();
  result.finalTitle = await page.title();
  await browser.close();

  console.log(`\n--- RESULT ---`);
  console.log(`Steps: ${result.steps}`);
  console.log(`Summary: ${result.summary}`);
  if (result.error) console.log(`Error: ${result.error}`);
  console.log(`Final URL: ${result.finalUrl}`);
  console.log(`Final Title: ${result.finalTitle}`);

  return result;
}

// ── Run test cases ──────────────────────────────────────────────────────

async function run() {
  if (!API_KEY) { console.error("NO API KEY FOUND. Test cannot run."); process.exit(1); }

  // Test 1: Wikipedia extraction (read-only, no forms)
  await test(
    "Go to the Pre-eclampsia Wikipedia page and tell me the diagnostic criteria in 3 bullet points with exact thresholds",
    "https://en.wikipedia.org/wiki/Pre-eclampsia"
  );

  // Test 2: Drug info lookup
  await test(
    "Find the dosing information for metformin in patients with renal impairment on Wikipedia",
    "https://en.wikipedia.org/wiki/Metformin"
  );

  // Test 3: PubMed search
  await test(
    "Search PubMed for 'cardiac troponin athletes', return the titles and PMIDs of the first 3 results",
    "https://pubmed.ncbi.nlm.nih.gov"
  );
}

run().catch(e => { console.error("CRASH:", e); process.exit(1); });
