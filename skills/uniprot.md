# UniProt — Protein Knowledgebase

> **URL:** https://www.uniprot.org
> **Type:** Protein sequence and functional information
> **Login:** None required
> **CF:** None
> **Tested:** ✅ 2026-07-04 (P68871 beta hemoglobin lookup)

## Use Cases

- Look up protein sequences, domains, and PTMs
- Find protein function, subcellular location, and interactions
- Identify disease-associated variants
- Get cross-references to other databases (PDB, Reactome, etc.)

## Search Pattern

### UniProt ID Lookup

```
agent_execute instruction:
  "Look up UniProt entry P68871 (hemoglobin subunit beta) and extract
   the function, subcellular location, disease variants, and sequence"
url: https://www.uniprot.org
```

### Gene/Protein Search

```
agent_execute instruction:
  "Search UniProt for 'human insulin receptor' and list the first 5 entries
   with their accession number, protein name, gene name, and length"
```

### Steps (manual tool equivalent)

1. **Navigate** to `https://www.uniprot.org`
2. **Type** accession (e.g., P68871), gene name (e.g., HBB), or keyword
3. **Click** Search
4. **Results page** loads (for keyword searches)
5. **Click** an entry → detail page at `/uniprotkb/<accession>/entry`
6. **Entry page** tabs:
   - **Entry** — function, names, subcellular location, disease/variants, PTM, expression, interaction, structure, family/domains, sequence
   - **Publications** — literature citing this entry
   - **Feature viewer** — graphical sequence feature map
   - **External links** — cross-references to PDB, Reactome, etc.
   - **History** — version history

## Known Selectors

| Element | Notes |
|---------|-------|
| Search box | Main search bar on every page |
| Search scope button | Default: UniProtKB (can switch to other DBs) |
| Entry tabs | Entry, Publications, Feature viewer, etc. |
| Sections within Entry | Collapsible: Function, Names & Taxonomy, etc. |
| Tools button | BLAST, Align, Peptide search |

## Known Issues

- **149M+ TrEMBL entries** — use specific queries (accession, gene name, organism)
- Reviewed (Swiss-Prot) entries have highest-quality annotations
- Feature viewer is JS-heavy — use tabpanel text for data extraction
- Some entries have community-curated annotations (noted on page)
- Search supports Boolean operators and field-specific queries (`organism_id:9606`)

## Example: P68871 (HBB — Hemoglobin subunit beta)

- **Status**: UniProtKB reviewed (Swiss-Prot), score 5/5
- **Amino acids**: 147
- **Organism**: Homo sapiens
- **Function**: Involved in oxygen transport; LVV-hemorphin-7 potentiates bradykinin
- **Features**: Binding sites, modified residues, variants (including sickle cell disease associated variant)
