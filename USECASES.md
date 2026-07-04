# page-agent-hermes — Comprehensive Use Case Matrix

> A systematic catalog of what works, what doesn't, and what tool to use for every common clinical/bioinformatics web research task.

---

## Quick Navigation

| Tool | Stack | Best For |
|---|---|---|
| **agent_execute** | Headless Chromium + LLM (ReAct loop) | Static non-blocking pages — 1-shot extract |
| **web_extract** | HTTP fetch → markdown | Medscape, ARUP, PubMed E-utilities (text) |
| **Hermes Browserbase** | Real browser via cloud | CF-protected, JS-heavy, login-required |
| **web_search** | Search API | Discovery — find which page to hit |

---

## Accessibility Map

### ✅ Works with ALL approaches

| Site | agent_execute | web_extract | Browserbase | Notes |
|---|---|---|---|---|
| Wikipedia (any) | ✅ | ✅ | ✅ | Fast 1-shot; text in body |
| NIH / NHLBI (.gov) | ✅ | ✅ | ✅ | Static guidelines |
| Google Finance | ✅ | ⚠️ (limited) | ✅ | agent_execute is fastest (0 steps, 11s) |

### ✅ Works with web_extract only (HTTP accessible, blocks headless)

| Site | agent_execute | web_extract | Browserbase | Notes |
|---|---|---|---|---|
| Medscape (text) | ❌ CF | ✅ | ✅ | Proven in clinical-diagnostic-search skill |
| ARUP Consult | ❌ | ✅ | ✅ | Lab reference gold standard |
| ACOG bulletins | ❌ | ✅ (PDF) | ✅ | Guideline PDFs |
| PubMed E-utilities | ❌ CF | ✅ (API) | ✅ | Structured abstract data |

### ✅ Works with Browserbase only (CF/JS-heavy)

| Site | agent_execute | web_extract | Browserbase | Notes |
|---|---|---|---|---|
| PubMed (full page) | ❌ CF | ❌ | ✅ | JS-heavy search interface |
| NSE India | ❌ crash | ❌ | ✅ | Heavy JS session |
| Drugs.com | ❌ Akamai | ❌ | ✅ | Edge-blocked to headless |
| UptoDate | ❌ paywall | ❌ | ✅ | Subscription required |
| ClinicalTrials.gov | ⚠️ partial | ⚠️ partial | ✅ | Search API also available |

### ❌ Blocked / Not accessible

| Site | All approaches | Reason |
|---|---|---|
| AccuWeather | ❌ | Heavy JS crashes headless; paywalled |
| Most login-only portals | ❌ | No session management |

---

## Use Case Catalog (clinical research)

### A. Disease Diagnostic Criteria

**Goal:** Extract diagnostic thresholds for a condition (BP, labs, imaging)

**Best toolchain:**
```
web_search (guideline) → web_extract (Medscape/ARUP) → synthesize
```

**Proven on:** Pre-eclampsia (15 tests, 2-tier triage, ACOG+Medscape+ARUP)
**Time:** ~3-5 min
**See skill:** `clinical-diagnostic-search`

### B. Lab Reference Ranges

**Goal:** Find normal ranges, critical values, units for a lab test

| Source | Tool | Quality |
|---|---|---|
| ARUP Consult | `web_extract` | ✅ Up-to-date, structured |
| Medscape Lab Ref | `web_extract` / Browserbase | ✅ Comprehensive |
| Wikipedia | `agent_execute` | ⚠️ May be outdated |
| Mayo Clinic Labs | Browserbase | ✅ High quality |

### C. Drug Information

**Goal:** Dosing, interactions, contraindications

| Site | Access | Tool |
|---|---|---|
| Drugs.com | ❌ Akamai block (headless/HTTP) | Browserbase |
| Medscape Drug Ref | ❌ CF | Browserbase |
| NIH DailyMed | ✅ | web_extract |
| Wikipedia | ✅ | agent_execute |

### D. Stock / Market Data

**Goal:** Current price, change, historical data

| Source | Tool | Quality |
|---|---|---|
| Google Finance | `agent_execute` ✅ | Fastest (11s, 0 steps) |
| NSE India | Browserbase ✅ | Requires JS session |
| Yahoo Finance | Browserbase ⚠️ | Sometimes CF |

### E. Research Paper Search

**Goal:** Find papers by topic, get abstracts, PMIDs

| Source | Tool | Notes |
|---|---|---|
| PubMed E-utilities API | `web_extract` ✅ | Structured, fast, no CF |
| PubMed web | Browserbase ✅ | Full JS interface |
| arXiv | `web_extract` ✅ | No CF |
| bioRxiv | `web_extract` ✅ | No CF |
| Google Scholar | Browserbase ⚠️ | Rate-limited |

### F. Clinical Guidelines

**Goal:** Extract recommendations from major guideline bodies

| Source | Tool | Notes |
|---|---|---|
| NIH / NHLBI | `agent_execute` ✅ | Static, fast |
| NICE (UK) | `web_extract` ✅ | Accessible |
| ACOG | `web_extract` (PDF) ✅ | Practice bulletins |
| WHO | `web_extract` ✅ | Accessible |
| ESC / ACC | Browserbase ⚠️ | Some CF |

---

## Workflow Decision Tree

```
What's the task?
│
├─ Extract diagnostic criteria / lab ranges / guidelines?
│   └─ web_search (discover sources) → web_extract (fetch top 2-3) → synthesize
│      Use clinical-diagnostic-search skill
│
├─ Get drug dosing / interactions?
│   ├─ Drugs.com → Browserbase (Akamai blocks everything else)
│   └─ DailyMed / Wikipedia → web_extract or agent_execute
│
├─ Stock price / financial data?
│   ├─ Google Finance → agent_execute (11s, 1 call)
│   └─ NSE India / JS-heavy → Browserbase
│
├─ Research paper search?
│   ├─ PubMed API (E-utilities) → web_extract (fastest, no CF)
│   └─ PubMed web / Google Scholar → Browserbase
│
└─ Wikipedia / NIH static page?
    └─ agent_execute (1 call, 0-4 steps)
```

---

## Performance Benchmarks

| Task | Tool | Steps | Time | Token Cost |
|---|---|---|---|---|
| Stock price (GOOGL) | agent_execute | 0 | 11s | ~2K in + ~0.5K out |
| Wikipedia extraction (Pre-eclampsia) | agent_execute | 4 | 49s | ~12K in + ~0.5K out |
| Lab range (ARUP) | web_extract | — | ~3s | ~0.5K |
| PubMed abstract (API) | web_extract | — | ~2s | ~0.5K |
| Drugs.com interaction | Browserbase | 2-3 turns | ~20s | variable |

**Rule of thumb:** `agent_execute` competes with `web_extract` only when the page is static and non-blocking. For those, agent_execute saves 2-3 Hermes turnarounds (observe → extract → done in 1 call instead of 3 tool calls). For anything else, `web_extract` or Browserbase is faster and more reliable.

---

## Repository Contents

| File | Purpose |
|---|---|
| `mcp-playwright.js` | MCP server — 9 tools including agent_execute |
| `comprehensive-tests.js` | Full ReAct loop test harness (LLM-dependent) |
| `test-agent-execute.js` | Direct Playwright + LLM test script |
| `quick-accessibility-test.js` | No-LLM page load checker |
| `skills/clinical-diagnostic-search/` | Clinical diagnostic workflow skill |
