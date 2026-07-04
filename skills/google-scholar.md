# Google Scholar — Academic Paper Search

> **URL:** https://scholar.google.com
> **Type:** Academic paper search engine
> **Login:** None required
> **CF:** Partial (may require JS challenge)
> **Tested:** ✅ 2026-07-04

## Use Cases

- Search recent academic papers by topic
- Find citation counts and related articles
- Discover preprint/accepted manuscript versions
- Get DOI and publisher links

## Search Pattern

```
agent_execute instruction:
  "Search Google Scholar for '17-hydroxyprogesterone LC-MS/MS method validation',
   list the first 10 results with authors, journal, year, and citation count"
url: https://scholar.google.com
```

### Steps (manual tool equivalent)

1. **Navigate** to `https://scholar.google.com`
2. **Type** search terms in the search box
3. **Click** Search or press Enter
4. **Results page** loads at `/scholar?q=<query>` showing count
   (e.g., "About 213 results (0.31 sec)")
5. Results include:
   - Title (linked)
   - Authors
   - Journal/venue, year
   - Publisher (e.g., ScienceDirect, PubMed Central, MDPI, Wiley)
   - Citation count
   - Related articles link
6. **Click** a result → external publisher page
7. Sort options: Relevance / Since Year / Review articles / Include patents

## Known Selectors

| Element | Notes |
|---------|-------|
| Search box | Main search input |
| Result title | Link to publisher |
| Cited by count | Shows as "Cited by N" |
| Related articles | Link to similar papers |
| Page navigation | Links to pages 1-10+ |

## Known Issues

- **Publisher paywalls** — clicking through to publisher sites (ScienceDirect, Springer, Wiley) may hit paywalls
- **PubMed Central** full-text articles are freely accessible
- **Cloudflare challenges** may appear after many repeated searches
- No API — scraping Google Scholar violates ToS (use PubMed for reliable API access)
- Limited to ~1000 results per query (Google's restriction)
- Use sparingly — rate limits are aggressive

## Better Alternative

For biomedical papers, prefer **PubMed** (via `esearch` + `esummary` API) which has proper API access and no rate limit issues for moderate use.
