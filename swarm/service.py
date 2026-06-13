"""Sonder survey service — the HTTP surface the frontend calls.

This is our lane's deliverable: a small FastAPI app that takes a region's finalists +
measurements + user priorities and returns Go / Conditional / No-go verdicts, streaming them as
each agent finishes so the map fills live. Stage 1 (screen) and the CV (measure) are other lanes;
if the request omits finalists/measurements we fall back to mock_data so the frontend can
integrate against this today.

Run:
    pip install -r swarm/requirements.txt
    uvicorn swarm.service:app --reload --port 8000

Endpoints:
    GET  /health
    POST /survey          -> full run (breadth + winner crew), JSON
    POST /survey/stream   -> Server-Sent Events: one 'verdict' per finalist, then 'winner', 'done'
"""
from __future__ import annotations

import json
from dataclasses import fields
from typing import Any, Optional

from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from . import mock_data, providers, config
from .schema import SiteInput, Measurements, UserPriorities, Verdict
from .orchestrator import run_breadth, run_crew, pick_winners

app = FastAPI(title="Sonder Survey Swarm", version="0.1.0")

# the frontend is a separate origin during dev
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)


# ---- request model ----------------------------------------------------------

class SurveyRequest(BaseModel):
    """Real runs MUST pass `finalists` + `measurements` (real Cyvl data). Mock stand-ins are
    refused unless `allow_mock=true` — so mock data can never reach a demo by accident."""
    finalists: Optional[list[dict[str, Any]]] = None       # SiteInput fields per item
    measurements: Optional[dict[str, dict[str, Any]]] = None  # site_id -> Measurements fields
    priorities: Optional[dict[str, Any]] = None            # station_size, required_frontage_ft, weights
    wave_size: Optional[int] = None
    crew_winners: Optional[int] = None
    deep_dive: bool = True
    allow_mock: bool = False                               # opt-in to mock_data; dev/tests only


def _safe(cls, d: dict, ctx: str):
    """Construct a dataclass from a dict, ignoring unknown keys; 422 on missing required fields."""
    names = {f.name for f in fields(cls)}
    kw = {k: v for k, v in d.items() if k in names}
    try:
        return cls(**kw)
    except TypeError as e:
        raise HTTPException(status_code=422, detail=f"{ctx}: {e}")


def _build(req: SurveyRequest) -> tuple[list[SiteInput], dict[str, Measurements], UserPriorities]:
    """Map the request into our dataclasses. Real runs require finalists + measurements (real
    Cyvl data); mock stand-ins are refused unless allow_mock is set."""
    if (not req.finalists or not req.measurements) and not req.allow_mock:
        raise HTTPException(
            status_code=400,
            detail="Provide real Cyvl 'finalists' and 'measurements'. Mock data is dev-only; "
                   "set allow_mock=true to use it intentionally.",
        )

    sites = (mock_data.finalists() if not req.finalists
             else [_safe(SiteInput, d, f"finalist[{i}]") for i, d in enumerate(req.finalists)])
    meas = (mock_data.measurements() if not req.measurements
            else {sid: _safe(Measurements, d, f"measurements[{sid}]") for sid, d in req.measurements.items()})
    prefs = _safe(UserPriorities, req.priorities, "priorities") if req.priorities else mock_data.priorities()

    # every finalist needs a measurement (real integration guard)
    if req.measurements:
        missing = [s.site_id for s in sites if s.site_id not in meas]
        if missing:
            raise HTTPException(status_code=422, detail=f"no measurements for sites: {missing}")
    return sites, meas, prefs


# ---- endpoints --------------------------------------------------------------

@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "mode": "real" if providers.have_key() else "mock",
        "breadth_model": config.BREADTH_MODEL,
        "crew_model": config.CREW_MODEL,
    }


@app.post("/survey")
def survey(req: SurveyRequest) -> dict[str, Any]:
    """Full run: breadth over all finalists, then a crew deep-dive on the winner(s)."""
    sites, meas, prefs = _build(req)
    wave = req.wave_size or config.WAVE_SIZE
    n_win = req.crew_winners or config.CREW_WINNERS

    verdicts = list(run_breadth(sites, meas, prefs, wave_size=wave))
    result: dict[str, Any] = {"verdicts": [v.to_dict() for v in verdicts]}

    if req.deep_dive:
        winners = pick_winners(verdicts, sites, n=n_win)
        by_id = {s.site_id: s for s in sites}
        crew = []
        for w in winners:
            try:
                crew.append(run_crew(by_id[w], meas[w], prefs).to_dict())
            except Exception as e:
                crew.append({"site_id": w, "error": str(e)})
        result["winners"] = winners
        result["crew"] = crew
    return result


@app.post("/survey/stream")
def survey_stream(req: SurveyRequest) -> StreamingResponse:
    """Server-Sent Events. Emits a 'verdict' event per finalist as agents finish, then a
    'winner' event with the crew verdict, then 'done'. The frontend pins light up live."""
    sites, meas, prefs = _build(req)
    wave = req.wave_size or config.WAVE_SIZE
    n_win = req.crew_winners or config.CREW_WINNERS

    def sse(event: str, data: Any) -> str:
        return f"event: {event}\ndata: {json.dumps(data)}\n\n"

    def gen():
        verdicts: list[Verdict] = []
        for v in run_breadth(sites, meas, prefs, wave_size=wave):
            verdicts.append(v)
            yield sse("verdict", v.to_dict())
        if req.deep_dive and verdicts:
            by_id = {s.site_id: s for s in sites}
            for w in pick_winners(verdicts, sites, n=n_win):
                try:
                    cv = run_crew(by_id[w], meas[w], prefs)
                    yield sse("winner", cv.to_dict())
                except Exception as e:
                    yield sse("error", {"site_id": w, "error": str(e)})
        yield sse("done", {"count": len(verdicts)})

    return StreamingResponse(gen(), media_type="text/event-stream")


@app.post("/report/pdf")
def report_pdf(payload: dict) -> Response:
    """Render one surveyed/screened site to a PDF using the survey lane's reportlab generator.
    Body: {site: {id,addr,nb,lat,lng,score,cost,pay,m{...},img}, verdict: <live verdict|null>,
    required_frontage_ft: float}."""
    from .report_pdf import build_live_pdf
    try:
        data, filename = build_live_pdf(payload)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"pdf build failed: {type(e).__name__}: {e}")
    return Response(content=data, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{filename}"'})
