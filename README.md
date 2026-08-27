# Fantasy Football App

Full-stack starter: FastAPI backend + React/TypeScript frontend.

## Prerequisites

- Python 3.11+ (`python --version`)
- Node.js 20+ (`node --version`)

## Run the backend (terminal 1)

```powershell
cd backend
python -m venv .venv          # one-time: create virtual environment
.venv\Scripts\activate        # activate it (do this every new terminal)
pip install -r requirements.txt   # one-time (like mvn install)
uvicorn main:app --reload --port 8000
```

Check it works: open http://127.0.0.1:8000/api/health — you should see JSON.

## Run the frontend (terminal 2)

```powershell
cd frontend
npm install    # one-time
npm run dev
```

Open http://localhost:5173

## How the connection works

The frontend calls `fetch("/api/health")` — a relative URL. Vite's dev
server (see `frontend/vite.config.ts`) proxies anything under `/api` to
`http://127.0.0.1:8000`, so the browser thinks everything comes from one
origin and CORS never comes up. In production you'd have nginx or your
host do the same thing.
>>>>>>> 2177d9c (Initial setup FastAPI & react)
