# NICE Guidelines — UK Clinical Guidance

> **URL:** https://www.nice.org.uk
> **Type:** UK clinical practice guidelines
> **Login:** None required
> **CF:** None
> **Tested:** ✅ 2026-07-04

## Use Cases

- Find current UK clinical guidelines by condition
- Extract management recommendations and algorithms
- Compare NICE vs other guideline sources
- Get quality standards and technology appraisals

## Search Pattern

### Guideline Search

```
agent_execute instruction:
  "Search NICE for 'type 2 diabetes' guidelines, open the NG28 guideline,
   and extract the key recommendations for pharmacological management"
url: https://www.nice.org.uk
```

### Steps (manual tool equivalent)

1. **Navigate** to `https://www.nice.org.uk`
2. **Type** search query in the search bar
3. **Click** Search or press Enter
4. **Results page** loads at `/search?q=<query>` showing count
   (e.g., "Showing 1 to 15 of 434 results for type 2 diabetes")
5. Results include:
   - Guideline identifier (NG28, QS209, PH38, TA924, etc.)
   - Title and description
   - Type (Guideline, Quality Standard, Technology Appraisal, etc.)
6. **Click** a result → `/guidance/<id>`
7. **Guideline page** shows:
   - Overview and scope
   - Last reviewed date
   - Link to full recommendations
   - Visual summaries
   - Related quality standards and evidence

## Result Types (from search)

| Prefix | Type | Example |
|--------|------|---------|
| NG | Guideline | NG28 — Type 2 diabetes in adults |
| QS | Quality Standard | QS209 — Type 2 diabetes |
| PH | Public Health | PH38 — Type 2 diabetes prevention |
| TA | Technology Appraisal | TA924 — Tirzepatide for T2D |
| DG | Diagnostic Guidance | |
| MT | Medical Technology | |

## Known Issues

- Some guideline detail pages require clicking through multiple sections
- PDF versions available for download
- Last reviewed dates are shown — check for currency
- Results include guidelines from all NICE divisions (health, social care, public health)
