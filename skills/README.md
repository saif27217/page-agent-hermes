# page-agent-hermes Skills

> Tested instruction templates for `agent_execute` (ReAct loop) targeting
> real-world clinical/biochemistry websites.

**⚠️ Not Hermes skills.** These are markdown docs with prompt templates
for the `agent_execute` MCP tool — not `.hermes/skills/`-loadable skills.
Copy the instruction text into an `agent_execute` call, not `skill_view`.

**One exception:** [multi-source-research.md](./multi-source-research.md) is a
**terminal/API pipeline** (curl + Google Docs), not an `agent_execute` template.

## How to Use

Load a skill into `agent_execute` by passing its `instruction` as a
natural-language prompt, optionally with a `url` to start from.

### Example

```json
{
  "instruction": "Search DailyMed for levofloxacin, click the first generic result, and extract the boxed warning section",
  "url": "https://dailymed.nlm.nih.gov/dailymed/"
}
```

## Skills Index

| Site | Type | Login | CF | File |
|------|------|-------|----|------|
| [DailyMed](./dailymed.md) | FDA drug labeling | No | No | ✅ |
| [ClinicalTrials.gov](./clinicaltrials.md) | Clinical trial registry | No | No | ✅ |
| [Reactome](./reactome.md) | Pathway browser | No | No | ✅ |
| [RCSB PDB](./rcsb-pdb.md) | Protein structures | No | No | ✅ |
| [NICE Guidelines](./nice-guidelines.md) | UK clinical guidelines | No | No | ✅ |
| [OpenTargets](./opentargets.md) | Drug-target validation | No | No | ✅ |
| [Google Scholar](./google-scholar.md) | Academic search | No | Partial | ✅ |
| [UniProt](./uniprot.md) | Protein database | No | No | ✅ |
| [ClinPGx](./clinpgx.md) | Pharmacogenomics | No | No | ✅ |
| [Multi-Source Research](./multi-source-research.md) | **7-API pipeline** (curl) | No | No | ✅ |
| [Biochem Multi-Source Research](./biochem-multi-source-research.md) | **Deep-dive pipeline** (RAG + web + APIs) | No | No | ✅ |

## Test Results (July 2026)

| Site | Status | Notes |
|------|--------|-------|
| Medscape | ❌ | Cloudflare Error 1005 (blocked) |
| OMIM | ❌ | Cloudflare challenge (login-gated anyway) |

## Skill Format

Each skill file contains:
- **Goal**: What `agent_execute` instruction to use
- **URL**: Entry point
- **Selectors**: Known CSS selectors for key elements
- **Pattern**: Step-by-step interaction sequence
- **Known Issues**: Rate limits, login requirements, quirks

**Note**: The page-agent-hermes `agent_execute` uses `data-pa-idx` selectors,
not CSS selectors. CSS selectors are used by the manual tools
(`browser_click`, `browser_type`).
