# Sonder | EV Charger Site Screening

**Live demo: [sonder-206.vercel.app](https://sonder-206.vercel.app)**

Compare potential curbside EV charger locations using saved Somerville infrastructure data.

The hosted demo is an earlier build. These screenshots show the interface in this checkout.

![Sonder map and selected street segment](assets/screenshots/workspace.jpg)

Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright).

Search streets, filter by segment length and screening score, or select an area on the map. Open a segment to inspect its recorded data and prepare a printable report.

![Recorded street view on Summer Street](assets/screenshots/street-view.jpg)

Street views open near the selected segment. Returning to the map restores the search, filters, and selection. The [Autodesk example](https://sonder-cad.vercel.app) shows one School Street model.

## Quick Start

The screening interface runs without a backend or API key. Python 3 is enough:

```bash
git clone https://github.com/Smokeybear10/208.PROJ.sonder.git
cd 208.PROJ.sonder
python3 -m http.server 2400 --directory demo
```

Open http://localhost:2400

## Data and Scope

The app includes 456 street segments derived from the Cyvl infrastructure export. Scores compare geometry, nearby mapped assets, and road-marking proxies. They do not establish charger fit, electrical capacity, installation cost, or payback.

Recorded street captures and detection overlays provide evidence for a desk review. Usable curb space, accessibility, restrictions, utility capacity, and permits still need verification on site. AI reviews are optional and disabled until a real backend is configured.

## Tech Stack

| Layer | Tools |
| --- | --- |
| Interface | HTML, CSS, JavaScript, Leaflet |
| Street view | Pannellum, Cyvl captures |
| Data processing | Python, GeoPandas, Shapely |
| Optional services | FastAPI, Claude |
| 3D example | Autodesk APS |

## Project Structure

```text
demo/             # Screening interface, saved data, and street viewer
screening/        # Spatial features and scoring
survey/, swarm/   # Optional site-review services
cad/              # LiDAR-to-CAD pipeline and Autodesk viewer
platform_export/  # Source GIS layers
```

Built by Thomas Ou, Aarav Raina, Sayem Kamal, and Maximus Rome at the Cyvl Physical AI Hackathon.
