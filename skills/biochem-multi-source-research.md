# Biochem Multi-Source Research

> **Deep-dive research pipeline** for clinical biochemistry topics. Combines
> biochem RAG database queries, web search (Tavily/parallel-cli), Wikipedia
> + PubMed REST APIs, NCBI PMC full-text extraction, and NCBI clinical
> web research into a structured report.

**Use when:** You need a comprehensive feature/protocol/mechanism deep-dive
on a biochemistry or clinical laboratory topic — not just a definition.
Covers literature, vendor docs, guidelines, and real-world implementation data.

**Do NOT use this with `agent_execute`.** This is a **terminal/API + subagent
pipeline** — multiple parallel data sources compiled into a unified report.

---

## When to Use This vs. multi-source-research.md

| Scenario | Use this skill | Use multi-source-research.md |
|----------|---------------|------------------------------|
| Deep-dive on a specific feature/protocol | ✅ | ❌ |
| Definition + reference ranges only | ❌ | ✅ |
| Topic has RAG collection (biochem, harrison, etc.) | ✅ | ❌ |
| Need vendor/product-specific details | ✅ | ❌ |
| Need pathway + protein + drug data | ❌ | ✅ |
| Need autoverification rules, middleware features, SOPs | ✅ | ❌ |

---

## Architecture

```
Topic
  ├── 1. Biochem RAG         — Tietz, Harrison, VDC, sports-medicine collections
  ├── 2. Web Search (Tavily)  — academic + general sources, vendor docs
  ├── 3. Wikipedia            — REST API (definition, context)
  ├── 4. PubMed               — E-utilities (top 10 papers with PMIDs, DOIs)
  ├── 5. NCBI PMC             — full-text article extraction for feature detail
  ├── 6. Clinical Web Research — guidelines, protocols, SOPs from clinical sites
  │
  └── → Parallel delegate → Compile → Structured report
```

---

## Step-by-Step Pipeline

### Step 1: Biochem RAG Query (if collection exists)

```bash
# Query biochem-v1 (Tietz textbook)
~/.hermes/bin/rag search "biochem-v1" "{TOPIC}" --top-k 10 --json

# Query harrison-22nd (clinical disease management)
~/.hermes/bin/rag search "harrison-22nd" "{TOPIC}" --top-k 10 --json

# Query vdc (protocols/SOPs/guidelines)
~/.hermes/bin/rag search "vdc" "{TOPIC}" --top-k 5 --json

# Query updates-v1 (recent OpenAlex findings)
~/.hermes/bin/rag search "updates-v1" "{TOPIC}" --top-k 5 --json

# Query updates-v2 (PubMed literature)
~/.hermes/bin/rag search "updates-v2" "{TOPIC}" --top-k 5 --json
```

**RAG collection roles:**

| Collection | What it brings |
|---|---|
| biochem-v1 | Molecular/analyte-level evidence (Tietz textbook) |
| harrison-22nd | Clinical disease management context |
| sports-medicine | Exercise/athlete-specific context |
| vdc | Protocol/SOP/guideline framework |
| updates-v1 | Recent findings (OpenAlex daily cron) |
| updates-v2 | PubMed literature (auto-ingested) |

**Pitfall:** Some queries time out with `--top-k 10` on large collections.
Use `--top-k 5` for VDC and updates collections. Always use `--json` for
structured output.

---

### Step 2: Web Search (Tavily)

Run 5 parallel searches covering different angles:

```bash
# Search 1: Core definition + features
tavily_search "middleware clinical biochemistry laboratory features"
# --include_domains: ncbi.nlm.nih.gov, aacc.org, pathologyoutlines.com

# Search 2: Specific feature deep-dive (e.g., autoverification)
tavily_search "{TOPIC} {SPECIFIC_FEATURE} clinical laboratory"
# --include_domains: clinchem.org, ajcp.org, labmedicine.com

# Search 3: Vendor/product documentation
tavily_search "{VENDOR} {PRODUCT} middleware features"
# e.g., "Data Innovations Instrument Manager features"

# Search 4: Implementation case studies
tavily_search "{TOPIC} implementation hospital laboratory experience"

# Search 5: Comparison/versus analysis
tavily_search "{TOPIC} vs {ALTERNATIVE} clinical laboratory"
# e.g., "middleware vs LIMS clinical lab"
```

**Tavily extraction for full content:**

```bash
tavily_extract urls: ["https://pathologyoutlines.com/...", "https://ncbi.nlm.nih.gov/..."]
```

---

### Step 3: Wikipedia REST API

```bash
# Summary (definition, key facts)
curl -sL --max-time 10 \
  "https://en.wikipedia.org/api/rest_v1/page/summary/{PAGE_TITLE}"

# Full page content (reference ranges, clinical thresholds)
curl -sL --max-time 15 \
  "https://en.wikipedia.org/api/rest_v1/page/html/{PAGE_TITLE}" \
  | sed 's/<[^>]*>//g' | sed '/^$/d' | head -400
```

**Pitfalls:**
- Greek letters in URL: use canonical title from `page/summary` response
- Spaces → underscore or `%20`
- Page names are case-sensitive

---

### Step 4: PubMed E-utilities

```bash
# Search for PMIDs
ESCAPED_TERM=$(python3 -c "import urllib.parse; print(urllib.parse.quote('{SEARCH_TERM}'))")
PIDS=$(curl -sL --max-time 10 \
  "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${ESCAPED_TERM}&retmax=10&retmode=json" \
  | python3 -c "import json,sys; ids=json.load(sys.stdin)['esearchresult']['idlist']; print(','.join(ids))")

# Get structured metadata
curl -sL --max-time 10 \
  "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${PIDS}&retmode=json" \
  | python3 -c "
import json,sys
data = json.load(sys.stdin)
for uid, result in data.get('result',{}).items():
    if uid == 'uids': continue
    title = result.get('title','')
    source = result.get('source','')
    pubdate = result.get('pubdate','')
    doi = ''
    for aid in result.get('articleids',[]):
        if aid.get('idtype') == 'doi': doi = aid.get('value','')
    print(f'PMID: {uid}')
    print(f'Title: {title}')
    print(f'Journal: {source} ({pubdate})')
    print(f'DOI: {doi}')
    print()
"
```

**Query tips:**
- Multi-word terms auto-translate to MeSH — check `translationset`
- Use `+` for AND, `OR` for OR
- Add `&filter=dates.2024/01/01-2026/12/31` for date-limited searches
- Rate limit: 10 requests/second without API key

---

### Step 5: NCBI PMC Full-Text Extraction

For feature-level detail, extract full text from PMC articles:

```bash
# Find PMC articles
curl -sL --max-time 10 \
  "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pmc&term={SEARCH_TERM}&retmax=10&retmode=json"

# Extract full text via web_extract or Tavily
tavily_extract urls: ["https://www.ncbi.nlm.nih.gov/pmc/articles/PMC{ID}/"]
```

**Key PMC article types to look for:**
- Case studies: "Customized middleware experience in tertiary care"
- Reviews: "Autoverification in core clinical chemistry laboratory"
- Guidelines: "CLSI AUTO standard"
- Vendor white papers: instrument-specific middleware guides

---

### Step 6: Clinical Web Research

```bash
# Search for guidelines and protocols
tavily_search "{TOPIC} guideline clinical laboratory"
# --include_domains: cap.org, clsi.org, who.int, nice.org.uk

# Search for implementation guides
tavily_search "{TOPIC} implementation guide SOP laboratory"

# Search for comparison/benchmarking
tavily_search "{TOPIC} benchmarking performance metrics laboratory"
```

---

## Parallel Execution Pattern

Use `delegate_task` with 3 concurrent subagents for maximum speed:

```
Subagent 1: RAG queries (all 6 collections)
Subagent 2: Web search (Tavily) + Wikipedia + PubMed APIs
Subagent 3: NCBI PMC extraction + clinical web research
```

All 3 run independently — compile after all complete.

---

## Report Structure

```markdown
# {Topic} — Biochem Multi-Source Report

> Compiled {DATE} from: Biochem RAG, Tavily Web Search, Wikipedia,
> PubMed, NCBI PMC, Clinical Web Research

## 1. Definition & Architecture
(What it is, where it sits in the lab ecosystem, key terminology)

## 2. Core Features
(Detailed feature list with sub-features, organized by category)

## 3. Feature Deep-Dive
(Each major feature explained with:
  - What it does
  - How it works (algorithm/logic)
  - Configuration options
  - Real-world performance data)
(Example: Autoverification → rule types, achievable rates, cost savings)

## 4. Integration & Connectivity
(Protocols: HL7, ASTM, FHIR; architecture diagrams; vendor compatibility)

## 5. Vendor Landscape
(Commercial solutions, distinctive features, pricing tier if available)

## 6. Implementation Considerations
(Setup complexity, staffing needs, training, common pitfalls)

## 7. Regulatory & Compliance
(Frameworks: 21 CFR Part 11, ISO 15189, CAP/CLIA; audit trail features)

## 8. Literature (PubMed — top 10)
(Table: #, PMID, Title, Journal, DOI)

## 9. RAG Source Highlights
(Key passages from biochem-v1, harrison-22nd, vdc collections)

## Key Clinical Takeaways
(3-5 most important findings, front-loaded)
```

---

## Example: Middleware Research Workflow

This skill was validated during a deep-dive on "Middleware in Clinical
Biochemistry Labs" (July 2026). The pipeline produced:

**Sources queried:**
- Biochem RAG: Tietz Ch.26 (automation), CLSI AUTO03-A2 standard
- Tavily: PathologyOutlines, Beckman Coulter, CLP Magazine, Ascentry
- PubMed: PMC9577123, PMC4023033, PMC4204236
- Wikipedia: LIMS, Middleware (distributed computing)

**Features extracted (14 categories):**
1. Autoverification engine (10+ rule types, 70-95% rates)
2. Reflex/reflexive testing
3. QC management (Westgard rules, L-J charts)
4. Sample routing & workflow management
5. Instrument connectivity (HL7, ASTM, FHIR)
6. Data validation (8+ check types)
7. Multi-site management
8. POCT management
9. Reporting & analytics dashboards
10. Regulatory compliance (21 CFR Part 11, ISO 15189)
11. Integration architecture
12. Vendor platforms (8 major vendors mapped)
13. Market context ($3B market, 10% growth)
14. Emerging standards (IHE-LAW, FHIR)

---

## Pitfalls

| Issue | Fix |
|-------|-----|
| RAG query timeout on large collections | Use `--top-k 5` for VDC/updates |
| Tavily returns thin results | Add `--include_domains` for scholarly sources |
| PubMed returns 0 results | Broaden term; check `translationset` for MeSH rewrites |
| PMC full-text not available | Try adjacent PMC IDs; some articles are author manuscripts only |
| Wikipedia page not found | Use `page/summary` to discover canonical title |
| parallel-cli not installed | Fall back to Tavily MCP tools (`mcp_tavily_*`) |
| web_search/web_extract unavailable | Use Tavily MCP or curl-based PubMed/Wikipedia APIs |
| Subagent timeout (600s) | Split into smaller tasks; reduce `--top-k` |

---

## See Also

- [multi-source-research.md](./multi-source-research.md) — 7-API pipeline for definition + pathway + drug data
- [clinical-diagnostic-search](../clinical-diagnostic-search/) — search-based clinical diagnostic workflow
- Hermes skill `mega-rag-synthesize` — synthesizes all 6 RAG collections into clinical recommendations
- Hermes skill `multi-source-research` — full version with all curl parsers and entity maps
- Hermes skill `wiki-pubmed-lookup` — rapid Wikipedia + PubMed curl patterns
- Hermes skill `clinical-web-research` — clinical/biochemistry web research patterns
