# Species Relatedness Quiz

This app is an A/B quiz where each question asks:

> Which species (A or B) is more closely related to the target species?

## How it works

- Taxonomy data is stored in normalized files (`data/taxonomy_nodes.ndjson`, `data/media_by_taxon.json`, `data/species_ids.json`) generated from `data/species_taxonomy.json`.
- The server loads the taxonomy graph and computes relatedness using MRCA/distance.
- The browser fetches generated questions from `GET /api/question`.
- Stats are tracked in localStorage (`streak`, `bestStreak`, `totalAnswered`, `totalCorrect`, `accuracy`).

## API

- `GET /api/question?difficulty=easy|medium|hard`
- `GET /api/species?search=<term>&limit=<n>`
- `GET /api/species/:id`
- `GET /api/health`

## Data integrity

Run:

```bash
npm run build:data
npm run validate:clade
```

Validation checks:
- duplicate node IDs
- missing parent IDs
- parent-cycle detection
- minimum species count

## Scaling plan for a massive species set

1. Replace `data/species_taxonomy.json` with a generated snapshot from Open Tree of Life / NCBI taxonomy.
2. Move clade storage to DB tables (`nodes`, `edges`, `synonyms`, `media`).
3. Add async ingestion jobs and versioned snapshots.
4. Keep server-side question generation and cache lineage/MRCA lookups.


## Intelligent storage format

- `taxonomy_nodes.ndjson`: one taxonomy node per line for stream-friendly loading.
- `media_by_taxon.json`: compact id->image metadata lookup table.
- `species_ids.json`: a tight index used for fast question sampling.
- `dataset_report.json`: quick quality report (counts + image coverage).
