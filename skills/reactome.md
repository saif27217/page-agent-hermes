# Reactome — Pathway Browser

> **URL:** https://reactome.org
> **Type:** Biological pathway database
> **Login:** None required
> **CF:** None
> **Tested:** ✅ 2026-07-04

## Use Cases

- Browse biological pathways (metabolic, signaling, immune)
- Extract pathway hierarchy and sub-events
- Get reaction step details with GO annotations
- Download pathway data in SBML/BioPAX formats

## Search Pattern

### Pathway Search

```
agent_execute instruction:
  "Search Reactome for 'complement cascade' pathway, open the top result,
   and extract the description, sub-events, and literature references"
url: https://reactome.org
```

### Steps (manual tool equivalent)

1. **Navigate** to `https://reactome.org`
2. **Type** pathway name in search bar (top of page)
3. **Press Enter** or click search icon
4. **Results page** loads with count (e.g., 654 results for "complement cascade")
5. **Click** a result to open the pathway detail page
6. **Detail page** shows:
   - Stable ID (e.g., R-HSA-166658)
   - Pathway type and species
   - Full description
   - Hierarchy/breadcrumb: e.g., Immune System → Innate Immune System
   - Sub-events list (child pathways)
   - Literature references with PubMed IDs
   - Download options (SBML, BioPAX, PDF, SVG)

## Known Selectors

| Element | Notes |
|---------|-------|
| Search input | Search bar, accepts natural language |
| Result items | Pathway/Reaction entries |
| Pathway title | Link to detail page |
| Download buttons | SBML, BioPAX, PDF, SVG |

## Known Issues

- **Interactive Pathway Viewer** is a separate Canvas/JS app — text extraction from the viewer itself requires `browser_evaluate` or screenshots
- Search indexes both pathways and reactions — use specific pathway names for targeted results
- Default species filter is Homo sapiens — change via URL or search filters
- Results paginated at 24 per page

## Example: Complement Cascade

Pathway R-HSA-166658:
- **Type**: Pathway, Homo sapiens
- **Hierarchy**: Immune System → Innate Immune System → Complement Cascade
- **4 sub-events**: Initial triggering, Activation of C3 and C5, Terminal pathway, Regulation
- **Literature**: Multiple references with PMIDs
