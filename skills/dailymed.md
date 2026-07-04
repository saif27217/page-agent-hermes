# DailyMed — FDA Drug Labeling

> **URL:** https://dailymed.nlm.nih.gov/dailymed/
> **Type:** FDA drug label database
> **Login:** None required
> **CF:** None
> **Tested:** ✅ 2026-07-04

## Use Cases

- Find FDA-approved drug labeling (prescription, OTC, animal)
- Extract boxed warnings, dosing, adverse reactions
- Look up NDC codes and packagers
- Browse drug classes

## Search Pattern

### Basic Search

```
agent_execute instruction:
  "Search DailyMed for [drug name], click the first result for a generic
   formulation, and extract the boxed warning and dosage sections"
url: https://dailymed.nlm.nih.gov/dailymed/
```

### Steps (manual tool equivalent)

1. **Navigate** to `https://dailymed.nlm.nih.gov/dailymed/`
2. **Select radio** ALL DRUGS (default) or HUMAN DRUGS / ANIMAL DRUGS
3. **Type** drug name in search box (selectors: `input[name="search"]`)
4. **Click** Search button
5. **Results load** at same URL with query params
6. **Click** a result heading (each result has NDC code, packager name)
7. **Label page loads** with sections: Boxed Warning, Indications, Dosage, etc.

### Advanced Search

```
agent_execute instruction:
  "Search DailyMed for [drug name] with human drugs filter, sort by relevance,
   open the 3rd result, and extract all text from the Indications and Usage section"
```

## Known Selectors

| Element | CSS Selector |
|---------|-------------|
| Search input | `input[type="text"]` in the search form |
| Search button | `button:has-text("Search")` |
| All drugs radio | `input[value="all"]` |
| Human drugs radio | `input[value="human"]` |
| Result headings | `.dm-results h2 a` |
| sort dropdown | `select#searchResultsFilter` |
| Page selector | `select#page-selector` |
| Label sections | `.spl-section` or heading anchors |

## Known Issues

- **157K+ labels** — broad searches return many results (narrow with specific drug name)
- **Date filter**: Use Advanced Search for date-range filtering (active ingredients, manufacturer)
- **Web Services API** also available at `https://dailymed.nlm.nih.gov/dailymed/web-services.cfm` for programmatic access
- Label images (pill photos) require separate loading — text content loads inline

## Example: Levofloxacin Search

Search "levofloxacin" returns 139 results across 7 pages, organized by
manufacturer/NDC. Each result shows: drug name, NDC codes, and packager.
Clicking a result opens the full SPL (Structured Product Labeling) with:

- Boxed Warning
- Indications and Usage
- Dosage and Administration
- Contraindications
- Warnings and Precautions
- Adverse Reactions/Side Effects
- Drug Interactions
- Use in Specific Populations
- Patient Counseling Information
