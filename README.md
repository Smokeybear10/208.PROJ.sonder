# Sonder | EV Charger Site Screening

**Live demo: [sonder-206.vercel.app](https://sonder-206.vercel.app)**

**Autodesk scene: [sonder-cad.vercel.app](https://sonder-cad.vercel.app)**

Instant EV charger site screening from street-level 3D scans. Sonder ranks curb
segments, then sends AI surveyor agents to the finalists to measure each site,
inspect street imagery, and return a Go / Conditional / No-go verdict.
Every Autodesk action opens the same interactive APS scene for the rendered
School Street finalist.

Built at the Cyvl Physical AI Hackathon in Somerville, Massachusetts on June 13,
2026. The project combines Cyvl infrastructure data (LiDAR, digital twins, and
CV-detected assets) with Claude and Autodesk tooling.

## Docs in this repo

- [docs/HACKATHON.md](docs/HACKATHON.md) — full brief, schedule, prizes, official prompts, pitch format.
- [docs/JUDGING.md](docs/JUDGING.md) — the scoring rubric (4 criteria, /16) and how to win it.
- [docs/DATA.md](docs/DATA.md) — what data actually exists (MCP vs the public S3 bucket), label counts, the CV training paths.
- [docs/CYVL_API.md](docs/CYVL_API.md) — REST API reference, pulled from the live OpenAPI spec.
- [docs/SPATIAL_SDK.md](docs/SPATIAL_SDK.md) — the Python `cyvl` SDK (3D<->2D projection, LiDAR, viewer).
- [docs/IDEAS.md](docs/IDEAS.md) — team idea shortlist plus the official prompts.
- [platform_export/](platform_export/) — Somerville layers exported from the platform (shapefiles + GeoJSON), including the routable street centerline. See its README.
- [CLAUDE.md](CLAUDE.md) — instructions for Claude Code in this repo.

## Repository layout

- `demo/` — production screening interface and its site data.
- `cad/` — LiDAR-to-CAD pipeline, Autodesk viewer, deployment, and tests.
- `survey/`, `screening/`, `swarm/` — site scoring and survey-agent services.
- `platform_export/` — source GIS exports used by the pipeline.
- `assets/brand/` — consolidated Sonder logo and icon exports.
- `design/` — retained interface studies; superseded mockups have been removed.
- `docs/` — project notes and the complete pitch packet.

## Key links

- Platform: https://cyvl.app/projects?chatModal=open
- API docs (Swagger): https://i3.cyvl.app/docs
- MCP endpoint: https://i3.cyvl.app/mcp
- Reference build: https://phi-cyvl.github.io/
- Spatial SDK: https://github.com/roadgnar/cyvl-spatial-sdk
- Ask Boston: https://askboston.ai

## Rules that matter

- Real Cyvl data only. Fake data scores a 0 on the data criterion (25% of the total).
- Not a "Google Maps clone" — that is named as a 0 on technical.
- Use one or two sponsor tools, woven in, not bolted on. More is not better.
- Bring a working demo AND a business case. 5 min pitch + 2 min Q&A.
- Don't reframe an existing solution as novel. Search first.
- API key is private. Do not commit it.
