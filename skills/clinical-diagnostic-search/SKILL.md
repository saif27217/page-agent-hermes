---
name: clinical-diagnostic-search
description: >
  Search-based clinical diagnostic workflow for collating tests, thresholds, and
  guidelines for any medical condition. Proven on pre-eclampsia (2024 ACOG +
  Medscape + ARUP Consult). Use when the user asks for "tests to diagnose X",
  "diagnostic workup for Y", or "labs for condition Z".
version: 1.0.0
tags: [clinical, diagnosis, laboratory, ACOG, Medscape, ARUP, preeclampsia]
related_skills: [epic-biochem-workflows, clinical-decision-support, rag-to-slide, infographic-carousel]
---

# Clinical Diagnostic Search

> Pattern: 2 parallel web searches → fetch top authoritative sources → synthesize
> with thresholds, caveats, and LIMS-ready output.

---

## When to Use

- "tests to diagnose/pre-eclampsia"
- "diagnostic workup for [condition]"
- "labs/criteria for [syndrome/disease]"
- User needs structured lab thresholds, not a narrative overview

---

## Step-by-Step Workflow

### 1. Parallel Authoritative Search (2 calls, concurrent)

**Search A**: Guideline body + condition
```
site:acog.org OR site:uptodate.com OR site:arupconsult.com "[condition] diagnosis tests labs guidelines"
```

**Search B**: Clinical reference + condition workup
```
"[condition] diagnostic workup laboratory studies imaging criteria thresholds"
```

Both calls go out simultaneously. No serial dependency.

### 2. Source Triage

From results, pick top 3 URLs in this priority order:
1. `arupconsult.com` — lab-focused, structured thresholds
2. `emedicine.medscape.com` — detailed workup with numeric cutoffs
3. ACOG practice bulletin PDF — gold-standard guideline
4. `ncbi.nlm.nih.gov/books` — summary of major guidelines
5. `uptodate.com` — comprehensive clinical features

Fetch with `web_extract(urls=[...])`.
- Max 5 URLs per call.
- Prefer updated pages (`Updated:` or `Last Update:` dates visible).
- Skip paywalled / inaccessible URLs.

### 3. Synthesis Template

Output structured in this order:

**a) Diagnostic foundation** — 1–2 sentences: core definition + required combination (e.g., BP + proteinuria/organ dysfunction).

**b) Initial labs (all patients)** — bullet list.

**c) Additional labs (severe features / suspected HELLP)** — bullet list.

**d) Diagnostic thresholds** — grouped by system (renal, platelet, hemolysis, liver, metabolic). Format:
```
- Test: >value or <value (unit)
```

**e) Specialized / predictive markers** — PlGF, sFlt-1:PlGF, etc.

**f) Imaging / fetal assessment** — relevant studies.

**g) LIMS-critical caveats** — false negatives, exceptions, serial monitoring advice.

### 4. Quality Rules

- **Sources cited inline**: every threshold traces to at least one fetched URL.
- **Dated sources**: include `(Source, Month YYYY)` after each major section.
- **Thresholds only with units**: never plain numbers.
- **Caveats flagged when sensitivity is low**: explicitly state negative predictive value where available.
- **Conflict resolution**: if ACOG and Medscape disagree on a cutoff, show both and note which is "Sibai threshold" / widely accepted.

### 5. Optional Output Modes

- **Structured JSON/CSV** — if user asks "for LIMS": export test codes, ranges, thresholds.
- **Sliding-scale alert** — if user asks for triage logic: ordered test cascade (diarrhea → platelets → AST/ALT → creatinine → LDH).

---

## Proven Example: Pre-eclampsia

Full findings live in `references/preeclampsia-workup.md`. Key outcome: 15 tests collapsed into 2 triage tiers + 3 specialized markers, sourced from Medscape (Mar 2025) + ARUP Consult (May 2026) + ACOG PB 222.

### Calls Made

1. `web_search`: "pre-eclampsia diagnosis tests labs 2024 ACOG guidelines proteinuria creatinine platelets" (limit=8)
2. `web_search`: "pre-eclampsia diagnostic workup liver function uric acid Doppler ultrasound site:medscape.com OR site:acog.org" (limit=5)
3. `web_extract`: medscape workup + arupconsult (parallel, 2 URLs)

### Pitfalls Avoided

- Did NOT rely on single-source narrative.
- Did NOT extrapolate without numeric cutoffs.
- Flagged that ~10% preeclampsia and ~20% eclampsia lack proteinuria.
- Flagged HELLP can occur without hypertension OR proteinuria.
- Distinguish predictive markers (PlGF) from diagnostic ones (proteinuria).
- Parallel web_search + web_extract instead of serial full-page browses (3× faster).

---

## Reuse Pattern

Trigger with any condition. Replace bracketed terms and run same 3-step sequence.

```python
# Pattern (pseudo)
search_a = web_search("site:arupconsult.com [condition] diagnosis labs")
search_b = web_search("[condition] workup thresholds Medscape")
extract   = web_extract([top_2_urls])
```

Store the resulting structured output in:
- Chat response (default)
- Markdown file if "save this" requested

---

## Integration With Existing Skills

- `epic-biochem-workflows`: register as Workflow #21
- `clinical-decision-support`: feed structured output into CDS documents
- `rag-to-slide` / `infographic-carousel`: use threshold tables as slide content
- `pytdc` / `primekg`: cross-reference drug targets if condition is pharmacologically treatable
