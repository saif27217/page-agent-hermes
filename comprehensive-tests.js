#!/usr/bin/env node
"use strict";
// comprehensive-tests.js — Systematically test all agent_execute use cases
// Uses MCP SDK to test the server via agent_execute (ReAct loop)

const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

// ─── Config ────────────────────────────────────────────────────────────
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

const AGENT_TOOLS = [
  { type: "function", function: { name: "click", description: "Click an interactive element by its index", parameters: { type: "object", properties: { index: { type: "integer", minimum: 0, maximum: 39 } }, required: ["index"] } } },
  { type: "function", function: { name: "type", description: "Type text into an input field by its index", parameters: { type: "object", properties: { index: { type: "integer", minimum: 0, maximum: 39 }, text: { type: "string" } }, required: ["index", "text"] } } },
  { type: "function", function: { name: "scroll", description: "Scroll the page", parameters: { type: "object", properties: { direction: { type: "string", enum: ["down", "up"] } }, required: ["direction"] } } },
  { type: "function", function: { name: "done", description: "Mark task complete with summary", parameters: { type: "object", properties: { summary: { type: "string" } }, required: ["summary"] } } },
];

const AGENT_SYSTEM = `You are a web browsing agent. Complete the user's task in one tool call per step.

IMPORTANT: The page text is provided in "text" field. READ IT FIRST before clicking anything. Most answers are already in the text.

If an element is not visible or a click fails, try a different approach rather than repeating the same click.

Observation fields:
- text: first 12KB of body text (has most answers)
- elements: visible interactive elements (links, buttons, inputs)

Tool rules:
- click index=N — clicks element N
- type index=N text="..." — fills element N (use for search boxes)
- scroll down/up
- done summary="..." — ONLY when answer collected. PUT THE ACTUAL DATA IN summary.`;

const ELEM_LIMIT = 40;
const MAX_STEPS = 14;
const LLM_TIMEOUT = 30_000;

let testResults = [];

async function callLLM(messages) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LLM_TIMEOUT);
  try {
    const resp = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
      body: JSON.stringify({ model: MODEL, messages, tools: AGENT_TOOLS, parallel_tool_calls: false }),
      signal: controller.signal,
    });
    if (!resp.ok) throw new Error(`LLM ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
    const data = await resp.json();
    if (data.error) throw new Error(data.error.message);
    if (!data.choices?.length) throw new Error("Empty LLM response");
    return data.choices[0].message;
  } finally { clearTimeout(timeout); }
}

async function runAgent(instruction, url) {
  process.stderr.write(`\n[TEST] ${instruction.slice(0, 100)}...\n`);
  process.stderr.write(`       URL: ${url}\n`);

  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const ctx = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 900 },
  });
  const page = await ctx.newPage();

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 }).catch(() => {});
  await page.waitForTimeout(1000);

  const history = [];
  let step = 0;
  let summary = "";
  let error = "";
  let sameActionFails = 0;
  let lastActionKey = "";
  let cloudflare = false;

  while (step < MAX_STEPS) {
    // Observe
    let text, map, title, currentUrl;
    try {
      text = await page.evaluate(() => (document.body?.innerText || "").slice(0, 12000));
      title = await page.title();
      currentUrl = page.url();
      cloudflare = text.toLowerCase().includes("cloudflare") || title.toLowerCase().includes("cloudflare");
      map = await page.evaluate((limit) => {
        const sel = ["a[href]", "button", "input:not([type=hidden])", "select", "textarea", "[role='button']", "[role='link']", "[contenteditable='true']", "summary"];
        const seen = new Set(); let idx = 0; const map = [];
        for (const s of sel) {
          const nodes = document.querySelectorAll(s);
          for (const el of nodes) {
            if (idx >= limit) break;
            if (el.offsetParent === null && el.tagName !== "SUMMARY") continue;
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) continue;
            const key = (el.tagName + "|" + (el.href || el.textContent?.trim()?.slice(0, 30) || "")).slice(0, 120);
            if (seen.has(key)) continue; seen.add(key);
            let t = el.innerText?.trim() || el.ariaLabel || el.placeholder || "";
            el.setAttribute("data-pa-idx", String(idx));
            map.push({ index: idx, tag: el.tagName.toLowerCase(), text: t.slice(0, 80) }); idx++;
          }
          if (idx >= limit) break;
        }
        return map;
      }, ELEM_LIMIT);
    } catch (e) { error = "Observe failed: " + e.message; break; }

    if (cloudflare) { summary = `BLOCKED: Cloudflare detected on ${currentUrl}`; break; }

    const obs = JSON.stringify({ title, url: currentUrl, text: text.slice(0, 10000), elements: map.slice(0, ELEM_LIMIT) });
    const messages = [
      { role: "system", content: AGENT_SYSTEM },
      ...history,
      { role: "user", content: `Task: ${instruction}\n\nCurrent page (step ${step}):\n${obs}` },
    ];

    // Call LLM
    let msg;
    try { msg = await callLLM(messages); } catch (e) { error = `LLM: ${e.message}`; break; }

    const toolCalls = msg.tool_calls;
    if (!toolCalls?.length) { summary = msg.content || "No tool call returned"; break; }

    const call = toolCalls[0];
    let args = {};
    try { args = JSON.parse(call.function.arguments); } catch { history.push({ role: "assistant", content: `(bad args from LLM)` }); step++; continue; }

    if (call.function.name === "done") { summary = args.summary || "Task complete"; break; }

    const actionKey = `${call.function.name}:${JSON.stringify(args)}`;
    if (actionKey === lastActionKey) sameActionFails++;
    else { sameActionFails = 0; lastActionKey = actionKey; }
    if (sameActionFails >= 3) {
      const t = await page.evaluate(() => (document.body?.innerText || "").slice(0, 8000));
      summary = `(STUCK) Page text at ${currentUrl}:\n${t.slice(0, 2000)}`;
      break;
    }

    if (call.function.name === "scroll") {
      await page.evaluate(args.direction === "down" ? "window.scrollBy(0, window.innerHeight)" : "window.scrollBy(0, -window.innerHeight)");
      history.push({ role: "assistant", content: `scrolled ${args.direction}` });
    } else if (call.function.name === "click") {
      try { await page.click(`[data-pa-idx="${args.index}"]`, { timeout: 3000 }); await page.waitForTimeout(600); }
      catch (e) { history.push({ role: "assistant", content: `click [${args.index}] failed: ${e.message.slice(0, 80)}` }); }
    } else if (call.function.name === "type") {
      try { await page.fill(`[data-pa-idx="${args.index}"]`, args.text, { timeout: 3000 }); await page.waitForTimeout(500); }
      catch (e) { history.push({ role: "assistant", content: `type [${args.index}] failed` }); }
    }

    await page.waitForTimeout(200);
    step++;
  }

  await browser.close();
  return { steps: step, summary, error, cloudflare, finalUrl: page?.url?.() || url };
}

// ─── Test Cases ────────────────────────────────────────────────────────

const TESTS = [
  // 1. Stock Data — Google Finance (simple, CF might block)
  {
    name: "Stock data — GOOGL price on Google Finance",
    instruction: "Find Google (GOOGL) stock price on Google Finance. Get the current price and daily change percentage.",
    url: "https://www.google.com/finance/quote/GOOGL:NASDAQ",
    skipIfCF: true,
  },
  // 2. Drug Info — Medscape (static page)
  {
    name: "Drug info — Metformin dosing",
    instruction: "Go to the Drugs.com metformin page. Extract the adult dosing for type 2 diabetes: starting dose, usual maintenance range, and maximum dose.",
    url: "https://www.drugs.com/dosage/metformin.html",
    skipIfCF: false,
  },
  // 3. Clinical Lab Range — Mayo Clinic
  {
    name: "Clinical lab — Vitamin B12 reference range",
    instruction: "Find the normal reference range for vitamin B12 (cobalamin) on the Medscape lab reference page. Report the values and units.",
    url: "https://emedicine.medscape.com/article/2088959-overview",
    skipIfCF: true,
  },
  // 4. Wikipedia extraction
  {
    name: "Wikipedia — Pre-eclampsia diagnostic criteria",
    instruction: "Go to the Pre-eclampsia Wikipedia page. Extract the diagnostic criteria: what are the blood pressure thresholds, proteinuria threshold, and any other lab criteria. Give exact numbers.",
    url: "https://en.wikipedia.org/wiki/Pre-eclampsia",
    skipIfCF: false,
  },
  // 5. PubMed search (CF blocked)
  {
    name: "PubMed — Search cardiac troponin athletes",
    instruction: "On PubMed, search for 'cardiac troponin athletes'. Return the title and PMID of the first result.",
    url: "https://pubmed.ncbi.nlm.nih.gov",
    skipIfCF: true,
  },
  // 6. Weather — simple static
  {
    name: "Weather — Current conditions",
    instruction: "Check the current weather conditions in Hyderabad, India on weather.gov or accuweather. Get temperature and conditions.",
    url: "https://www.accuweather.com/en/in/hyderabad/202190/weather-forecast/202190",
    skipIfCF: true,
  },
  // 7. Table extraction — Wikipedia comparison table
  {
    name: "Wikipedia table — ACE inhibitors list",
    instruction: "On the ACE inhibitor Wikipedia page, find the table listing ACE inhibitors. List the drug names and their common brand names.",
    url: "https://en.wikipedia.org/wiki/ACE_inhibitor",
    skipIfCF: false,
  },
  // 8. Drug-drug interaction (static page)
  {
    name: "Drug interaction — Metformin + NSAIDs",
    instruction: "On Drugs.com, find the metformin interaction page. Is there a major interaction between metformin and ibuprofen? What about metformin and aspirin?",
    url: "https://www.drugs.com/drug-interactions/metformin-index.html",
    skipIfCF: false,
  },
  // 9. Simple form fill — NSE/BSE stock lookup (India markets)
  {
    name: "Indian stock — NSE India Reliance price",
    instruction: "Go to NSE India's stock quote page for Reliance Industries. Get the current market price and day's high/low if visible.",
    url: "https://www.nseindia.com/get-quotes/equity?symbol=RELIANCE",
    skipIfCF: true,
  },
  // 10. Static guidelines page from NIH
  {
    name: "NIH — Hypertension guidelines JNC 8",
    instruction: "Go to the NIH NHLBI hypertension guidelines page. What are the JNC 8 blood pressure thresholds for treatment in adults over 60?",
    url: "https://www.nhlbi.nih.gov/health/high-blood-pressure",
    skipIfCF: false,
  },
];

async function runAll() {
  if (!API_KEY) { console.error("NO API KEY"); process.exit(1); }
  console.log(`Model: ${MODEL}`);
  console.log(`Tests: ${TESTS.length}`);
  console.log("");

  for (let i = 0; i < TESTS.length; i++) {
    const t = TESTS[i];
    process.stderr.write(`\n${"─".repeat(60)}\n`);
    process.stderr.write(`[${i + 1}/${TESTS.length}] ${t.name}\n`);
    process.stderr.write(`${"─".repeat(60)}\n`);

    const start = Date.now();
    const result = await runAgent(t.instruction, t.url);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    const status = result.cloudflare ? "⚠️ CF-BLOCKED" : result.error ? "❌ ERROR" : result.summary ? "✅ PASS" : "❌ FAIL";
    const summary = result.summary || result.error || "(no output)";

    testResults.push({
      name: t.name,
      status,
      steps: result.steps,
      elapsed: elapsed + "s",
      summary: summary.slice(0, 400),
    });

    console.log(`[${status}] ${t.name} (${result.steps} steps, ${elapsed}s)`);
    console.log(summary.slice(0, 500));
    console.log("");
  }

  // ── Summary Table ──
  console.log("");
  console.log("=".repeat(70));
  console.log("TEST RESULTS SUMMARY");
  console.log("=".repeat(70));
  for (const r of testResults) {
    console.log(`${r.status.padEnd(18)} ${r.name}`);
    console.log(`  Steps: ${r.steps}  Time: ${r.elapsed}  Summary: ${r.summary.slice(0, 120)}...`);
    console.log("");
  }

  const passed = testResults.filter(r => r.status === "✅ PASS").length;
  const blocked = testResults.filter(r => r.status === "⚠️ CF-BLOCKED").length;
  const failed = testResults.filter(r => r.status.startsWith("❌")).length;
  console.log(`Total: ${testResults.length}  ✅ Pass: ${passed}  ⚠️ CF: ${blocked}  ❌ Fail: ${failed}`);
}

runAll().catch(e => { console.error("CRASH:", e.message); process.exit(1); });
