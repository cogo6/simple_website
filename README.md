# Species Relatedness Quiz

This app is an A/B quiz where each question asks:

> Which species (A or B) is more closely related to the target species?

## How it works

- Canonical taxonomy source is `data/clade.json`.
- File mode: taxonomy data is stored in normalized files (`data/taxonomy_nodes.ndjson`, `data/media_by_taxon.json`, `data/species_ids.json`) generated from `data/clade.json`.
- DB mode: taxonomy data is loaded from PostgreSQL (`taxonomy_nodes`, `taxon_media`).
- The server loads the taxonomy graph and computes relatedness using MRCA/distance.
- Images are served from `/api/image/:id` with strict scientific-name lookup (Wikipedia) and a deterministic SVG fallback when no verified image is available.
- The browser fetches generated questions from `GET /api/question`.
- Stats are tracked in localStorage (`streak`, `bestStreak`, `totalAnswered`, `totalCorrect`, `accuracy`).

## Run with Docker Postgres

1. Start Postgres:

```bash
npm run db:up
```

2. Import `clade.json` into Postgres:

```bash
# If using a non-default mapped port, set DATABASE_URL first.
# PowerShell example:
# $env:DATABASE_URL = "postgres://postgres:postgres@localhost:5433/animals"
npm run db:import
```

3. Start app in DB mode:

```bash
# PowerShell
npm start
```

Optional environment variables:
- `DATABASE_URL` (default: `postgres://postgres:postgres@localhost:5432/animals`)
- `POSTGRES_PORT` for Docker port mapping (default: `5432`)
- `PHYLO_SOURCE` (default: `postgres`, set to `file` to force local files)
- `PHYLO_REQUIRE_DB=1` to fail fast instead of falling back to file mode

## API

- `GET /api/question?difficulty=easy|medium|hard`
- `GET /api/species?search=<term>&limit=<n>`
- `GET /api/species/:id`
- `GET /api/health`

## Data integrity

Run:

```bash
npm run build:clade
npm run build:data
npm run validate:clade
```

Validation checks:
- duplicate node IDs
- missing parent IDs
- parent-cycle detection
- minimum species count
- optional image-coverage threshold via `MIN_IMAGE_COVERAGE` (default `0`)

## Data artifacts

- `taxonomy_nodes.ndjson`: one taxonomy node per line for stream-friendly loading.
- `media_by_taxon.json`: compact id->image metadata lookup table.
- `species_ids.json`: a tight index used for fast question sampling.
- `dataset_report.json`: quick quality report (counts + image coverage).
