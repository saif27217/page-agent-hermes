# page-agent-hermes

Playwright-based MCP server bridging [Hermes Agent](https://hermes-agent.nousresearch.com/) to a headless Chromium browser. Drop-in replacement for browser automation — no Chrome extension, no open ports, no demo CDN keys.

## What it is

`mcp-playwright.js` exposes **8 MCP tools** over stdio so Hermes can drive a real browser:

| Manual tool | Purpose |
|------|---------|
| `browser_navigate` | Go to a URL |
| `browser_snapshot` | Full HTML snapshot of the current page |
| `browser_click` | Click a CSS selector |
| `browser_type` | Fill an input field |
| `browser_evaluate` | Run arbitrary JS in the page |
| `browser_screenshot` | Screenshot (in-memory base64 or file) |
| `browser_status` | Check browser state |
| `browser_close` | Shut down the browser |

| Agent tool | Purpose |
|------|---------|
| `agent_execute` | ReAct loop + reflection: give it an instruction + URL, it autonomously clicks, types, and scrolls up to 14 steps using LLM reasoning |

LLM-agnostic. Tested with **mimo-v2.5** via OpenRouter.

## Prerequisites

- Node.js **22+**
- npm
- x86_64 Linux with Chromium support (not Termux — Termux has no Chrome)

## Setup

```bash
git clone https://github.com/saif27217/page-agent-hermes.git
cd page-agent-hermes
npm install
npx playwright install chromium
```

## Hermes config

Append to `~/.hermes/config.yaml` inside `mcp_servers:`:

```yaml
  page-agent:
    command: node
    args:
      - /path/to/page-agent-hermes/mcp-playwright.js
    env:
      OPENROUTER_API_KEY: ${OPENROUTER_API_KEY}
      OPENROUTER_MODEL: mimo-v2.5
      OPENROUTER_API_BASE: https://openrouter.ai/api/v1
    enabled: true
```

Restart Hermes. Tools appear automatically.

## Quick test

```bash
# Verify the server boots cleanly
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{}}}' \
  | timeout 15 node mcp-playwright.js
# Expect: {"id":1,"result":{"serverInfo":{"name":"page-agent-hermes",...}}}

# Invoke via Hermes
# In any Hermes session:
# > use the agent to navigate to https://medscape.com and find levofloxacin renal dosing
```

## Why this over page-agent's MCP server

| | `page-agent` Chrome extension + MCP | `page-agent-hermes` |
|---|---|---|
| Browser required | Chrome (with extension loaded) | Chromium (headless, auto-installed) |
| Extension needed | Yes | No |
| Termux support | No (no Chrome) | Tested on VPS/desktop |
| Ports opened | WebSocket hub (38401) | stdio only |
| Deps | monorepo build | playwright npm package |
| Stability | Beta | Single-file, minimal |

## agent_execute vs original page-agent

| Feature | Original page-agent | page-agent-hermes v1.1.0 |
|---|---|---|
| ReAct loop | ✓ | ✓ internal in `agent_execute` |
| Reflection | ✓ (history rollup) | ✓ (step-by-step history to LLM) |
| Stable selectors | `data-index` on elems | `data-pa-idx` injected same way |
| DOM extraction | flatTree + selectorMap | selector map + first 4KB innerText |
| Skills system | ✓ `.agents/skills` | ✓ `skills/` — 9 tested templates |
| Multi-tab | ✓ Chrome extension | ✗ single tab |
| Vision | ✓ multimodal screenshot | ✗ text-only |
| Drag/drop | ✓ | ✗ stub out for now |
| Manual override | Panel UI | 8 explicit MCP tools |
| Setup | npm + build (8 pkg monorepo) | npm install playwright |

## Files

```
mcp-playwright.js   — single-file MCP server; contains both manual tools and agent_execute
package.json        — playwright dep + start/test scripts
README.md           — this file
skills/             — 9 tested `agent_execute` instruction templates
  README.md            — index and how-to
  dailymed.md          — FDA drug labeling
  clinicaltrials.md    — clinical trial registry
  reactome.md          — pathway browser
  rcsb-pdb.md          — protein structures
  nice-guidelines.md   — UK clinical guidelines
  opentargets.md       — drug-target validation
  google-scholar.md    — academic search
  uniprot.md           — protein database
  clinpgx.md           — pharmacogenomics
```

## Limitations

- No Shadow DOM or nested iframe traversal (use `browser_evaluate` to reach inside them)
- No drag-and-drop (extend `AGENT_TOOLS` to add it)
- Single tab per Hermes session; call `browser_close` then `browser_navigate` to reset
- Chromium must be installed: `npx playwright install chromium`
- `agent_execute` is limited to ELEM_LIMIT (40) visible interactive elements per step
- Text-only observation; no vision model
- Cloudflare-protected sites redirect to Hermes native browser tools automatically

## License

MIT — same as the upstream [alibaba/page-agent](https://github.com/alibaba/page-agent).
