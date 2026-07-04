# ClinPGx — Pharmacogenomics Database

> **URL:** https://www.clinpgx.org (successor to https://www.pharmgkb.org)
> **Type:** Pharmacogenomics knowledge base
> **Login:** None required
> **CF:** None
> **Tested:** ✅ 2026-07-04

## Use Cases

- Find gene-drug associations with prescribing guidance
- Access CPIC clinical practice guidelines
- Look up allele function and pharmacogenomic dosing
- Explore drug pathways affected by genetic variation

## Search Pattern

```
agent_execute instruction:
  "Search ClinPGx for warfarin gene-drug associations,
   extract the CPIC guideline summary and dosing recommendations"
url: https://www.clinpgx.org
```

### Steps (manual tool equivalent)

1. **Navigate** to `https://www.clinpgx.org`
2. **Type** drug, gene, or condition in search box
3. **Click** Search
4. **Results** show matching entries
5. Navigate sections:
   - **Genes** — actionable PGx genes
   - **Drugs** — drugs affected by PGx
   - **Pairs** — gene-drug associations
   - **All Guidelines** — CPIC clinical guidelines
   - **Drug Labels** — FDA PGx-annotated labeling
   - **Literature** — allele-drug associations from publications
   - **Pathways** — drug pathway diagrams

## Additional Resources

- **PharmDOG** — focused PGx guidance for mobile/any device
- **GSI** — compare PGx guidance from different sources
- **PharmCAT** — translate VCF data into PGx guidance
- **Downloads** — bulk data exports of curated PGx content
- **API Docs** — REST API for programmatic access

## Known Issues

- **New platform** — ClinPGx replaced PharmGKB; some redirects from old URLs
- Search indexes genes, drugs, and conditions together
- CPIC guidelines are peer-reviewed publications with evidence tables
- Some content requires understanding of PGx terminology (alleles, phenotypes, metabolizer status)

## Related Sites

| Site | URL | Content |
|------|-----|---------|
| CPIC | https://cpicpgx.org | Clinical guidelines |
| PharmGKB (legacy) | https://www.pharmgkb.org | Redirects to ClinPGx |
| FDA | https://www.fda.gov/drugs/science-and-research-drugs/table-pharmacogenomic-biomarkers-drug-labeling | PGx biomarkers in drug labeling |
