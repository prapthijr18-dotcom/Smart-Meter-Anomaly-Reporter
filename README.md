# Smart Meter Anomaly Reporter

A runnable hybrid implementation of the assignment:

- **MERN:** React + Vite frontend, Express/Node API, MongoDB report storage.
- **Automata component:** Python Flask microservice performs identifier/readings validation using equivalent regex + hand-coded DFA checks, and deterministic five-category classification.
- **SQLite:** dispatch/audit log persistence, as explicitly required by the assignment sheet.

## Architecture

React (5173) -> Express API (5000) -> Flask validation service (5001)
                                  -> MongoDB (`smart_meter_reports`)
                                  -> SQLite (`dispatch_audit.db`)

The assignment sheet specifically asks for Flask + SQLite in item 10. Since you also said MERN is compulsory, this project keeps MERN as the main application stack and uses Flask/SQLite for those explicitly named components.

## Requirements

- Node.js 18+
- Python 3.10+
- MongoDB running locally, or a MongoDB Atlas connection string

## Run

### 1. Flask validation service
```bash
cd flask-validator
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```
Runs at `http://localhost:5001`.

### 2. Express + MongoDB API
Open a second terminal:
```bash
cd server
npm install
copy .env.example .env
# Edit .env if your MongoDB URL differs
npm run dev
```
Runs at `http://localhost:5000`.

### 3. React frontend
Open a third terminal:
```bash
cd client
npm install
npm run dev
```
Open the Vite URL, usually `http://localhost:5173`.

## Identifier format used

- Meter ID: `GRID` + one uppercase alphabet + three digits + phase (`R`, `Y`, or `B`), e.g. `GRIDA123R`.
- Reading: five digits, decimal point, two digits, followed by `kWh`, e.g. `12345.67kWh`.

This makes the brief's `GRID[1-alpha][3-digit][PHASE]` and `[5-digit].[2-digit]kWh` formats concrete and testable. If your faculty defines different phase labels, change `PHASES` in `flask-validator/app.py`.

## Routing rules

- Grid sections A-E map to five crews.
- Each crew can hold at most six open reports.
- If the zone crew is unavailable/full, select the nearest available section (linear A-E distance; ties resolve alphabetically).
- If none is eligible, place report in the central waiting queue.
- Emergency/critical urgency is marked Critical and escalated; normal/high urgency is retained.
- Queue ordering is Critical > High > Normal, then earlier submission time, then report ID.
- API prevents duplicate assignment by checking existing report assignment before dispatch.

## API quick reference

- `POST /api/reports` create, validate, classify, dispatch and persist a report
- `GET /api/reports` list reports
- `GET /api/reports/:id` report details
- `PATCH /api/reports/:id/status` update status
- `PATCH /api/handlers/:section` set crew availability
- `GET /api/dashboard/summary` dashboard counts and distributions
- `GET /api/routing` routing table and SQLite dispatch audit

## Notes for your demonstration

1. Submit `GRIDA123R`, reading `12345.67kWh`, category text such as "meter seal broken".
2. Submit malformed ID such as `GRID123R` and show the validation reason.
3. Submit reports for A-E until one crew reaches six open cases; the next report should overflow to another crew or queue.
4. Toggle a crew unavailable and submit another report.
5. Search the generated report ID and update status through the dashboard.
