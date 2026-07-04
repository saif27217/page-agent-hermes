# OpenTargets — Drug Target Validation

> **URL:** https://www.opentargets.org
> **Type:** Drug target-disease association platform
> **Login:** None required
> **CF:** None
> **Tested:** ✅ 2026-07-04 (GraphQL API)

## Use Cases

- Find diseases associated with a drug target
- Get evidence scores for target-disease pairs
- Identify top drug targets for a disease
- Access genetic, literature, and pathway evidence

## Two Approaches

### Approach 1: API (Recommended — faster, structured)

OpenTargets has a public GraphQL API at `api.platform.opentargets.org/api/v4/graphql`
that doesn't need a browser. Use `browser_evaluate` or curl instead.

**Target search query:**
```graphql
query targetSearch($queryString: String!) {
  search(queryString: $queryString, entity: "target") {
    total
    hits {
      id
      approvedSymbol
      approvedName
      biotype
    }
  }
}
```

**Target-disease associations:**
```graphql
query targetAssociations($ensemblId: String!) {
  target(ensemblId: $ensemblId) {
    id
    approvedSymbol
    associatedDiseases {
      rows {
        disease {
          id
          name
        }
        score
      }
    }
  }
}
```

### Approach 2: Browser (for explore/browse)

```
agent_execute instruction:
  "Browse to opentargets.org, find the IL17A target page,
   and list the top 10 associated diseases with their evidence scores"
url: https://www.opentargets.org
```

## Known Issues

- **JS SPA** — the web interface is React-based and data loads via API calls
- The platform API is the canonical data source — prefer direct API calls
- Target IDs are Ensembl gene IDs (e.g., IL17A = ENSG00000112115)
- Association scores range 0-1 (higher = stronger evidence)
- Data refreshed periodically with each release

## Example: IL17A

Tested with IL17A (ENSG00000112115):
- **2,193 associated diseases**
- Top association: Psoriasis (score 0.635)
- Other top: Psoriatic arthritis (0.602), Ankylosing spondylitis (0.599), Hidradenitis suppurativa (0.413), Rheumatoid arthritis (0.398)
