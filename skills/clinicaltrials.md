# ClinicalTrials.gov — Clinical Trial Registry

> **URL:** https://clinicaltrials.gov
> **Type:** NIH clinical trial registry
> **Login:** None required
> **CF:** None
> **Tested:** ✅ 2026-07-04

## Use Cases

- Find active/incomplete clinical trials by condition
- Extract trial design, eligibility criteria, outcomes
- Identify sponsors and locations
- Check trial status (recruiting, active, terminated)

## Search Pattern

### Basic Condition Search

```
agent_execute instruction:
  "Search ClinicalTrials.gov for 'breast cancer' and list the first 5 results
   with their status, sponsor, and brief summary"
url: https://clinicaltrials.gov
```

### Advanced Search

```
agent_execute instruction:
  "Search ClinicalTrials.gov for phase 3 diabetes trials recruiting in India,
   list the first 10 results with NCT number, title, and locations"
url: https://clinicaltrials.gov/search?phase=2&phase=3&recr=true&cntry=IN
```

### Steps (manual tool equivalent)

1. **Navigate** to `https://clinicaltrials.gov`
2. **Type** search terms in the main search box
3. **Click** Search
4. **Results page** loads at `/search?cond=<condition>&viewType=Card`
5. Each result has a clickable title linking to `/study/NCT<number>`
6. **Trial detail page** shows:
   - Brief title and NCT ID
   - Sponsor/Collaborators
   - Status (recruiting, active, completed, terminated)
   - Brief summary
   - Condition/disease
   - Intervention/treatment
   - Eligibility criteria
   - Locations and contacts
   - Publications linked to this trial

## Known Selectors

| Element | Notes |
|---------|-------|
| Search input | Main search box on homepage |
| Search button | Submit button |
| Result cards | Display in card view by default |
| Trial title | Link to `/study/NCT*` |
| View type toggle | Switch between Card and Table view |

## Known Issues

- **Loading spinner** (`mat-spinner`) appears briefly — wait for it to disappear
- **Default sort is relevance** — can change to "Last updated" via URL param
- Angular SPA — URL changes reflect filter state
- Results are paginated (20 per page default)
- Some older trials may have minimal data

## API Alternative

For programmatic access, use the ClinicalTrials.gov API:

```
https://clinicaltrials.gov/api/query/full_studies?expr=<search>&fmt=json&max_rnk=<N>
```

But the browser is needed for interactive multi-faceted search (condition + location + phase + recruitment status + age groups).
