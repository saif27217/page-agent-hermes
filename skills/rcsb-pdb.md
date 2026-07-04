# RCSB PDB — Protein Data Bank

> **URL:** https://www.rcsb.org
> **Type:** Protein structure database
> **Login:** None required
> **CF:** None
> **Tested:** ✅ 2026-07-04 (search + structure page)

## Use Cases

- Look up protein 3D structures by PDB ID
- Search proteins by sequence, ligand, or function
- Extract structure metadata (resolution, method, ligands)
- Find related structures and literature

## Search Pattern

### PDB ID Lookup

```
agent_execute instruction:
  "Navigate to RCSB PDB and look up structure 4HHB (hemoglobin).
   Extract the title, classification, experimental method,
   resolution, ligands, and the full literature citation."
url: https://www.rcsb.org
```

### Keyword Search

```
agent_execute instruction:
  "Search RCSB PDB for 'hemoglobin' and list the first 5 structures
   with their PDB ID, resolution, and experimental method"
```

### Steps (manual tool equivalent)

1. **Navigate** to `https://www.rcsb.org`
2. **Type** PDB ID or keyword in search box
3. **Search** — redirects to `/search?q=<query>`
4. **Results page** shows:
   - PDB ID, structure title, authors
   - Resolution, experimental method
   - Release date, organism
   - Ligands/small molecules
   - Refinement sidebar (filter by method, resolution, organism)
5. **Click** a result → `/structure/<PDB_ID>`
6. **Structure page** shows:
   - Full title, classification
   - Experimental details (method, resolution, R-value, space group)
   - Macromolecules (chains, sequences)
   - Small molecules/ligands with chemistry
   - Literature citation with PubMed link
   - Validation report
   - Download options (PDB, mmCIF, FASTA)

## Known Selectors

| Element | Notes |
|---------|-------|
| Search box | Homepage search |
| Result cards | Structure entries |
| Refinement sidebar | Filter by method, organism, resolution |
| Structure tabs | Summary, Sequence, 3D View, etc. |

## Known Issues

- **3D viewer** is a JS WebGL app — use `browser_screenshot` for visual, `browser_evaluate` for data extraction
- 256K+ structures — use specific PDB IDs for fastest results
- Search supports Boolean operators and field-specific queries
- Some very old entries (pre-2000) may have minimal metadata
