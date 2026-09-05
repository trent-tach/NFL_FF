# Fantasy Football App

Full-stack app: FastAPI backend + React/TypeScript frontend.

## Stack

- Backend: FastAPI, Python 3.11+
- Frontend: React 19 + TypeScript, built with Vite
- Styling: Tailwind CSS v4 (via `@tailwindcss/vite`)
- Routing: React Router v7
- Database: PostgreSQL (not wired up yet)

## Prerequisites

- Python 3.11+ (`python --version`)
- Node.js 20+ (`node --version`)

## Run the backend (terminal 1)

```powershell
cd backend
python -m venv .venv              # one-time: create virtual environment
.venv\Scripts\activate            # activate it (every new terminal)
pip install -r requirements.txt   # one-time (like mvn install)
uvicorn main:app --reload --port 8000
```

Check it works: http://127.0.0.1:8000/docs

Run the frontend (terminal 2)

```powershell
cd frontend
npm install    # one-time
npm run dev
```

Open http://localhost:5173

## How the two connect

The frontend calls relative URLs like `/api/players`. Vite's dev server
(see `frontend/vite.config.ts`) proxies anything under `/api` to
`http://127.0.0.1:8000`, so the browser sees one origin and CORS never
comes up. In production nginx or the host does the same job.

## Frontend structure

```
frontend/src/
├─ app/         router + global providers
├─ routes/      pages (public/ now, app/ once there is auth)
├─ layouts/     page chrome - nav, footer
├─ components/  shared UI used in 2+ places
├─ features/    domain code: players, projections (coming)
├─ lib/         apiClient and shared helpers
└─ styles/      global stylesheet + Tailwind theme
```
