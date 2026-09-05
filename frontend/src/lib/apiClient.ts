/* The single door to the backend. Nothing else in the app calls fetch
   directly, which means auth headers, base URLs, retries and logging only
   ever have to be added in one place.

   The trap this file exists to close: fetch does NOT throw on a 404 or a 500,
   only on an actual network failure. Skip the res.ok check and a broken
   request quietly becomes undefined three components away from the cause. */

export async function apiGet<T>(path: string): Promise<T> {
  // Vite proxies /api/* to uvicorn on :8000 in dev, so this stays relative
  // and there is no CORS config to worry about.
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
  });

  if (!res.ok) {
    // Including the body is what makes a failure debuggable later.
    const body = await res.text();
    throw new Error(`API ${res.status} on ${path}: ${body}`);
  }

  // <T> works like a Java generic: the caller declares the shape it expects.
  // Note it is a compile-time promise, not a runtime check.
  return (await res.json()) as T;
}
