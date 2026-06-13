# Swarm — adversarial review + test coverage

An adversarial static analysis of `swarm/` to catch downstream issues before they bite during the
demo, plus the end-to-end test suite that locks the behavior. All tests run in **mock mode with the
Claude API key disabled** — nothing here spends credits.

## Issues found and fixed

Each was a real "works now, breaks later" trap.

| # | Issue | Why it bites later | Fix |
|---|---|---|---|
| 1 | `config.MAX_BREADTH_SITES` was defined but never used | A teammate sets it expecting a cost cap, gets billed for every site | Enforced in `run_breadth` (truncates the finalist list) |
| 2 | `SURVEYOR_SYSTEM` built with the `%` operator | Adding any literal `%` to the prompt text later crashes import | Switched to string concatenation |
| 3 | Real model JSON missing a key / bad type / out-of-range confidence | A single malformed model response crashes a live agent mid-demo | `providers._normalize`: fills defaults, coerces types, clamps confidence, validates the verdict label |
| 4 | Cache read did `Verdict(**json)` with no guard | A stale cache file from an older schema crashes every run until you find and delete it | `_cache_get` catches decode/type errors and treats the file as a miss |
| 5 | One failing agent propagated out of `run_breadth` | One bad site kills the whole map / SSE stream | Per-site try/except yields a flagged error verdict (`source=swarm.breadth.error`, `verdict=no_go`, `confidence=0`); the rest continue |
| 6 | Judge (crew) JSON built with raw `data[k]` | Same crash risk as #3 on the winner deep-dive | Judge output also runs through `_normalize` |
| 7 | Bad request body → uncaught `TypeError` → HTTP 500 | The frontend gets an opaque 500 on a partial finalist; missing measurements slip through | `_safe()` returns HTTP 422 naming the bad field; explicit "no measurements for sites" 422 |
| 8 | Empty finalist list → `winners[0]` IndexError in the CLI | Crashes if Stage 1 returns nothing | Guard: print "no finalists" and return |

Honesty preserved: an error verdict is clearly flagged (`error` field + distinct `source`), never a
fabricated assessment. The frontend can render it greyed. This keeps the "never show fake data"
rule (rubric: fake data = 0).

## What was checked and is fine

- No circular imports (`config` → `schema` → `prompts`/`providers` → `orchestrator` → `service`).
- No shared mutable defaults (`UserPriorities.weights` uses `default_factory`; test asserts it).
- `_parse_json` salvages a JSON object from fenced or prose-wrapped output, raises cleanly when none.
- Cache key includes the model/mode, so mock and real verdicts never collide.
- Coordinate/threading: waves bounded by `wave_size` (floored to 1); winners exclude error/no_go.

## Test suite

`tests/`, run with `pytest -q` from the repo root. 31 tests, ~0.2s, no network, no key.

- `conftest.py` — autouse fixture disables the API key and isolates the cache per test, so the suite
  can never call Anthropic or touch the real cache.
- `test_schema.py` — `Verdict` serialization incl. the `error` field; `UserPriorities` weights are
  not a shared mutable default.
- `test_providers.py` — mock mode active; `_parse_json` (plain / fenced / prose / no-JSON-raises);
  `_normalize` (defaults, confidence clamp, invalid label, scalar→list); all five mock gates
  (go / conditional / no_go x3) parametrized.
- `test_orchestrator.py` — one verdict per finalist; expected labels; cache avoids a second call;
  missing-measurement → error verdict; an agent exception is isolated (others still complete);
  `MAX_BREADTH_SITES` cap; `pick_winners` prefers go; crew block present; stale cache file ignored.
- `test_service.py` — `/health`; full `/survey` (verdicts + winner + crew); no-deep-dive; SSE
  stream emits the right events; incomplete finalist → 422; missing measurement → 422; custom
  complete inputs → 200.

## Run

```bash
pip install -r swarm/requirements.txt pytest
pytest -q                      # 31 passed
ANTHROPIC_API_KEY= pytest -q   # belt-and-suspenders: force-disable the key
```

## Known acceptable limitations (not bugs)

- CORS is open (`*`) for dev; tighten before any public deploy.
- `_parse_json` takes the first `{`..last `}` slice; if the model emits prose containing stray
  braces before the JSON it could mis-slice. The prompt says JSON-only and `_normalize` backstops it.
- Real-mode behavior (actual model verdict quality, latency, cost) is untested by design — we are
  not spending the key yet. The suite proves the plumbing; quality tuning comes when the key is live.
