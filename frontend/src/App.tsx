import { useEffect, useState } from "react";

// Mirrors the JSON shape the backend returns — like a DTO class in Spring.
interface HealthResponse {
  status: string;
  message: string;
}

export default function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Runs once when the component mounts and calls the backend.
  useEffect(() => {
    fetch("/api/health")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<HealthResponse>;
      })
      .then(setHealth)
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <main className="container">
      <h1>Fantasy Football</h1>

      {health && (
        <div className="card ok">
          <strong>Backend says:</strong> {health.message}
        </div>
      )}

      {error && (
        <div className="card bad">
          <strong>Could not reach the backend</strong> ({error}). Is uvicorn
          running on port 8000?
        </div>
      )}

      {!health && !error && <p>Contacting backend…</p>}
    </main>
  );
}
