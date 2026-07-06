# Multi-Source Research Pipeline

> **Not a browser-automation skill.** Unlike the other skills in this
> directory (which are `agent_execute` instruction templates), this is a
> **terminal/API pipeline** — runs curl commands against 7 free APIs,
> compiles results into markdown, then creates a Google Doc via Composio MCP.

**Use when:** you need a structured biomedical report aggregating data
from Wikipedia, PubMed, Reactome, UniProt, OpenTargets, ClinicalTrials.gov,
and DailyMed — all in one Google Doc.

**Do NOT use this with `agent_execute`.** This is not a Playwright/Puppeteer
automation. It's a shell script + API pipeline.

---

## Workflow

```
Topic
  ├── 1. Wikipedia     — definition, reference ranges, clinical context
  ├── 2. PubMed        — top 10 recent papers (PMIDs, DOIs, journals)
  ├── 3. Reactome      — pathway hierarchy (reactions, enzymes, diseases)
  ├── 4. UniProt       — key protein targets (function, variants, disease)
  ├── 5. OpenTargets   — drug-target associations (approved/clinical drugs)
  ├── 6. ClinicalTrials — active/recruiting trials
  ├── 7. DailyMed      — FDA drug labeling entries
  │
  └── → Compile → Create Google Doc → Return link
```

---

## Step-by-Step

### 0. Determine targets + terms

| Topic | Search term | UniProt target(s) | Ensembl ID(s) |
|-------|------------|-------------------|---------------|
| 17-OHP/CAH | 17-hydroxyprogesterone congenital adrenal hyperplasia | CYP17A1 (P05093), CYP21A2 (P08686) | ENSG00000148795, ENSG00000231852 |
| ACE inhibitors | ACE angiotensin | ACE (P12821) | ENSG00000159640 |
| Statins | HMGCR statin | HMGCR (P04035) | ENSG00000113161 |
| Warfarin | warfarin CYP2C9 | CYP2C9 (P11712), VKORC1 (Q9BQB6) | ENSG00000138109, ENSG00000167397 |

### 1. Wikipedia

```bash
curl -sL --max-time 10 "https://en.wikipedia.org/api/rest_v1/page/summary/{TOPIC_PAGE}"
curl -sL --max-time 15 "https://en.wikipedia.org/api/rest_v1/page/html/{TOPIC_PAGE}" \
  | sed 's/<[^>]*>//g' | sed '/^$/d' | head -300
```

### 2. PubMed

```bash
ESCAPED_TERM=$(python3 -c "import urllib.parse; print(urllib.parse.quote('''{TERM}'''))")
PIDS=$(curl -sL "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${ESCAPED_TERM}&retmax=10&retmode=json" \
  | python3 -c "import json,sys; ids=json.load(sys.stdin)['esearchresult']['idlist']; print(','.join(ids))")

curl -sL "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${PIDS}&retmode=json" \
  | python3 -c "import json,sys; d=json.load(sys.stdin)
for u,r in d.get('result',{}).items():
  if u=='uids': continue
  doi=''; [setattr(globals(),'doi',a.get('value','')) for a in r.get('articleids',[]) if a.get('idtype')=='doi']
  print(f\"PMID: {u}\nTitle: {r.get('title','')}\nJournal: {r.get('source','')} ({r.get('pubdate','')})\nDOI: {doi}\n\")"
```

### 3. Reactome

```bash
curl -sL "https://reactome.org/ContentService/search/query?query={TERM}&types=Pathway&species=Homo+sapiens"
curl -sL "https://reactome.org/ContentService/data/pathway/{PATHWAY_ID}/containedEvents"
```

### 4. UniProt

```bash
curl -sL "https://rest.uniprot.org/uniprotkb/search?query={GENE}+AND+organism_id:9606&format=json&size=5"
curl -sL "https://rest.uniprot.org/uniprotkb/{ACCESSION}?format=json"
```

### 5. OpenTargets

```bash
QUERY='{"query":"{ target(ensemblId: \"{ENSEMBL_ID}\") { id approvedSymbol approvedName function associatedDiseases(page: {index: 0, size: 10}) { rows { score disease { id name } } } drugAndClinicalCandidates { rows { drug { id name mechanismOfAction } clinicalStatus } } } }"}'
curl -sL -X POST "https://api.platform.opentargets.org/api/v4/graphql" \
  -H "Content-Type: application/json" -d "$QUERY"
```

### 6. ClinicalTrials.gov

```bash
curl -sL "https://clinicaltrials.gov/api/v2/studies?query.term={TERM}&pageSize=5&format=json&fields=NctId,BriefTitle,OverallStatus,SponsorName"
```

### 7. DailyMed

```bash
curl -sL "https://dailymed.nlm.nih.gov/dailymed/services/v2/spls.json?drug_name={DRUG}"
```

---

## Compile Report

Aggregate into an 8-section markdown file:

```
# {Topic} — Multi-Source Report
## 1. Biochemistry & Physiology
## 2. Clinical Role / Disease Association
## 3. Recent Literature (PubMed — top 10)
## 4. Pathway (Reactome)
## 5. Protein Targets (UniProt)
## 6. Drug Targets (OpenTargets)
## 7. Active Clinical Trials (ClinicalTrials.gov)
## 8. FDA Drug Labeling (DailyMed)
## Key Clinical Takeaways
```

**Google Docs formatting rules:**
- Remove `---` horizontal rules (render as ugly underscore lines in Docs)
- Use blank lines between sections instead
- Keep tables, headings, bold, lists (convert cleanly)
- Code blocks convert to monospace

---

## Create Google Doc

Requires Composio MCP with an active Google Docs connection:

```bash
hermes mcp test composio
# → Check googledocs toolkit is ACTIVE
```

Then use the Composio multi-execute tool:

```
COMPOSIO_SEARCH_TOOLS
  queries: [{use_case: "create a google document from markdown content"}]
  session: {generate_id: true}

COMPOSIO_MULTI_EXECUTE_TOOL
  session_id: {SESSION_ID}
  tools: [{
    tool_slug: "GOOGLEDOCS_CREATE_DOCUMENT_MARKDOWN",
    arguments: {
      title: "{TOPIC} — Multi-Source Report",
      markdown_text: "{COMPILED_MARKDOWN}"
    }
  }]
```

Returns `display_url` with the Google Docs link.

---

## Pitfalls (abridged)

| Issue | Fix |
|-------|-----|
| Wikipedia Greek letters in URL | Use canonical title from `page/summary` response |
| PubMed 0 results | Broaden term; check `translationset` |
| Reactome 404 on search | Use `?query=` not `/query/{text}` |
| Wrong Ensembl ID | Search OpenTargets first to discover correct ID |
| DailyMed no results | Skip section — not all topics have drug labeling |
| Composio connection expired | `hermes mcp reconnect composio` |

---

## See Also

- Hermes skill `multi-source-research` — full version with all curl parsers,
  pitfalls table, and pre-built entity map (load with `skill_view`)
- Other skills in this directory — browser-automation templates for individual sites
