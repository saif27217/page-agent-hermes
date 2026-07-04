#!/usr/bin/env node
"use strict";
// quick-accessibility-test.js — Checks if target pages are accessible via headless Chromium
// No LLM calls — just loads the page and checks basic accessibility

const { chromium } = require("playwright");

const TESTS = [
  { name: "Wikipedia — ACE inhibitors table", url: "https://en.wikipedia.org/wiki/ACE_inhibitor", check: "ACE|angiotensin|enalapril" },
  { name: "Drugs.com — Metformin interactions", url: "https://www.drugs.com/drug-interactions/metformin-index.html", check: "ibuprofen|aspirin|interaction" },
  { name: "NSE India — SBI stock quote", url: "https://www.nseindia.com/get-quotes/equity?symbol=SBIN", check: "SBI|SBIN|price|market" },
  { name: "NIH NHLBI — Hypertension", url: "https://www.nhlbi.nih.gov/health/high-blood-pressure", check: "blood pressure|mmHg|hypertension" },
  { name: "AccuWeather — Hyderabad", url: "https://www.accuweather.com/en/in/hyderabad/202190/weather-forecast/202190", check: "temperature|Cloudflare" },
  { name: "Drugs.com — Metformin dosing", url: "https://www.drugs.com/dosage/metformin.html", check: "mg|metformin|diabetes|dose" },
];

async function testPage(name, url, check) {
  console.log(`\n--- ${name} ---`);
  console.log(`URL: ${url}`);

  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
    const ctx = await browser.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      viewport: { width: 1280, height: 900 },
    });
    const page = await ctx.newPage();

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(2000);

    const title = await page.title();
    const text = await page.evaluate(() => (document.body?.innerText || "").slice(0, 8000));
    const url2 = page.url();
    const cf = text.toLowerCase().includes("cloudflare") || title.toLowerCase().includes("cloudflare");
    const contentLen = text.length;

    // Check if key terms are present
    const keywords = check.split("|");
    const found = keywords.filter(k => text.toLowerCase().includes(k.toLowerCase()));
    const accessible = !cf && found.length >= keywords.length * 0.5;

    console.log(`Title: ${title.slice(0, 80)}`);
    console.log(`Final URL: ${url2}`);
    console.log(`Content length: ${contentLen} chars`);
    console.log(`Cloudflare: ${cf ? "⚠️ YES" : "✅ no"}`);
    console.log(`Key terms found: ${found.length}/${keywords.length} (${found.join(", ")})`);
    console.log(`Accessible: ${accessible ? "✅ YES" : "⚠️ conditional"}`);

    // First 300 chars of meaningful content
    const clean = text.replace(/\n\s*\n/g, "\n").trim();
    console.log(`Preview: ${clean.slice(0, 400)}`);

    await browser.close();
    return { name, accessible, cf, contentLen, title, url: url2 };
  } catch (e) {
    console.log(`ERROR: ${e.message.slice(0, 100)}`);
    if (browser) await browser.close().catch(() => {});
    return { name, accessible: false, cf: false, contentLen: 0, error: e.message };
  }
}

(async () => {
  console.log("Page Accessibility Test (no LLM)");
  console.log(new Date().toISOString());
  console.log(`Chromium: ${chromium ? "loaded" : "missing"}`);

  let pass = 0, cf = 0, fail = 0;
  for (const t of TESTS) {
    const r = await testPage(t.name, t.url, t.check);
    if (r.accessible) pass++;
    else if (r.cf) cf++;
    else fail++;
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`RESULTS: ${TESTS.length} tests`);
  console.log(`  ✅ Accessible: ${pass}`);
  console.log(`  ⚠️  CF-Blocked: ${cf}`);
  console.log(`  ❌ Failed:     ${fail}`);
  console.log(`${"=".repeat(60)}`);
})();
