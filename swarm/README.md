# swarm/ — Sonder Stage 2 survey swarm

Our lane. Turns finalist curb segments into measured Go / Conditional / No-go verdicts with AI
surveyor agents. Full design + contracts in [../docs/SWARM.md](../docs/SWARM.md).

## Run it (mock mode, no key, no CV)

```bash
python -m swarm.run_demo
```

Prints a breadth verdict per finalist, then a deep-dive on the winner. Works today against
`mock_data.py` (stand-ins for Saim's screen and Max's measurements).

## Run it for real

Put the team key in `.env` (auto-loaded): `ANTHROPIC_API_KEY=sk-ant-...`. Then:

```bash
python -m swarm.run_demo            # CLI
python -m swarm.run_demo --limit 2  # frugal: only 2 finalists hit the API
```

Models: breadth uses `SWARM_BREADTH_MODEL` (default Haiku, cheap, one call per site), the winner
crew uses `SWARM_CREW_MODEL` (default Sonnet). Override in `.env`.

## The service (what the frontend calls)

```bash
pip install -r swarm/requirements.txt
uvicorn swarm.service:app --reload --port 8000
```

| Endpoint | Body | Returns |
|---|---|---|
| `GET /health` | — | `{ok, mode, breadth_model, crew_model}` |
| `POST /survey` | `SurveyRequest` | `{verdicts[], winners[], crew[]}` |
| `POST /survey/stream` | `SurveyRequest` | SSE: `verdict` per finalist, then `winner`, then `done` |

`SurveyRequest` — real runs MUST pass `finalists` + `measurements` (real Cyvl data). Omitting
either is refused with 400 unless `allow_mock: true` (dev/tests only), so mock data can never reach
a demo by accident.
```json
{
  "priorities": {"station_size": "curbside_l2", "required_frontage_ft": 18, "weights": {"power":1,"traffic":0.8,"fit":1.2}},
  "finalists": [ { ...SiteInput fields... } ],
  "measurements": { "seg_001": { ...Measurements fields... } },
  "wave_size": 6, "crew_winners": 1, "deep_dive": true,
  "allow_mock": false
}
```
Each verdict carries `lon`/`lat` so the frontend can animate the route and drop the pin at the site.

SSE for the live map — each event is `event: verdict\ndata: {Verdict json}`:
```js
const res = await fetch("http://localhost:8000/survey/stream", {
  method: "POST", headers: {"Content-Type": "application/json"},
  body: JSON.stringify({ priorities, finalists, measurements }),
});
const reader = res.body.getReader();   // parse SSE; on each 'verdict' drop a pin, on 'winner' open the report
```

## Files

| File | Role |
|---|---|
| `schema.py` | data contracts: `SiteInput` (Saim), `Measurements` (Max), `UserPriorities` (UI), `Verdict` (out) |
| `prompts.py` | surveyor system prompt + per-site builder; specialist crew + judge prompts |
| `providers.py` | Anthropic call + deterministic mock fallback |
| `orchestrator.py` | wave runner (breadth) + winner crew + disk cache |
| `config.py` | `.env` loading, model tiers, cost knobs |
| `service.py` | FastAPI app: `/health`, `/survey`, `/survey/stream` (SSE) |
| `mock_data.py` | stub finalists + measurements |
| `run_demo.py` | CLI end-to-end entry point |

## Wiring into the rest of Sonder

- Replace `mock_data.finalists()` with Saim's Stage 1 output (map to `SiteInput`).
- Replace `mock_data.measurements()` with Max's per-site measurements (map to `Measurements`).
- Stream `run_breadth(...)` verdicts to Thomas's survey endpoint; they arrive as agents finish.
- Verdicts are cached in `.swarm_cache/` keyed by site + station + weights, so rehearsals are free
  and reproducible. Delete the folder to force fresh runs.

Mock mode is for development and the demo fallback only. The verdicts we actually show must come
from the real agents on real measurements (PLAN.md §5.4).
