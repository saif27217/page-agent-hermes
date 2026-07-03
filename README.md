# page-agent-hermes

Playwright-based MCP server bridging [Hermes Agent](https://hermes-agent.nousresearch.com/) to a headless Chromium browser. Drop-in replacement for browser automation — no Chrome extension, no open ports, no demo CDN keys.

## What it is

`mcp-playwright.js` exposes **8 MCP tools** over stdio so Hermes can drive a real browser:

| Tool | Purpose |
|------|---------|
| `browser_navigate` | Go to a URL |
| `browser_snapshot` | Full HTML snapshot of the current page |
| `browser_click` | Click a CSS selector |
| `browser_type` | Fill an input field |
| `browser_evaluate` | Run arbitrary JS in the page |
| `browser_screenshot` | Screenshot (in-memory base64 or file) |
| `browser_status` | Check if browser is running |
| `browser_close` | Shut down the browser |

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
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"t","version":"1"}}}' \
  | timeout 15 node mcp-playwright.js
# Expect: {"id":1,"result":{"serverInfo":{"name":"page-agent-hermes",...}}}

# Check playwright internals
node -e "console.log(require('playwright').chromum ? 'ok' : '?')"

# Invoke via Hermes
# In any Hermes session:
# > use the browser to navigate to https://example.com
# > take a snapshot
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

## Files

```
mcp-playwright.js   — single-file MCP server; edit TOOLS to add more tools
package.json        — playwright dep + start/test scripts
README.md           — this file
```

## Limitations

- No Shadow DOM or nested iframe traversal (use `browser_evaluate` to reach inside them)
- No drag-and-drop (extend `TOOLS` to add it)
- Single tab per Hermes session; call `browser_close` then `browser_navigate` to reset
- Chromium must be installed: `npx playwright install chromium`

## License

MIT — same as the upstream [alibaba/page-agent](https://github.com/alibaba/page-agent).
