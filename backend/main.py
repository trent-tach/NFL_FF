"""
Fantasy Football API — entry point.

Spring Boot translation guide:
  - This file is roughly your @SpringBootApplication class + a @RestController in one.
  - `app = FastAPI()` is like the Spring application context being created.
  - `@app.get("/api/health")` is @GetMapping("/api/health").
  - The returned dict is auto-serialized to JSON, like returning an object
    from a @RestController method (Jackson does it in Spring; FastAPI uses Pydantic).
  - uvicorn (see README) plays the role of embedded Tomcat.
"""

from fastapi import FastAPI

app = FastAPI(title="Fantasy Football API")


@app.get("/api/health")
def health() -> dict:
    return {
        "status": "ok",
        "message": "Hello from FastAPI — backend and frontend are connected!",
    }
