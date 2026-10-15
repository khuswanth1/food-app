import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from app.core.cache import cache
from app.core.config import settings
from app.core.database import engine
from app.core.exceptions import register_exception_handlers
from app.core.logging import RequestLogMiddleware, configure_logging
from app.routers import admin, auth, cart, delivery, engagement, orders, payments, stores, users, vendor, ws
from app.services import uploads
from app.services.realtime import hub

configure_logging()


@asynccontextmanager
async def lifespan(app: FastAPI):
    if not os.getenv("QK_BOOTSTRAPPED"):  # multi-worker images bootstrap once before forking
        from app.bootstrap import bootstrap

        bootstrap()
    await hub.start(settings.REDIS_URL)
    yield
    await hub.stop()


TAGS = [
    {"name": "Auth", "description": "JWT login/registration. Use **Authorize** with the access token."},
    {"name": "Discovery", "description": "Search & filter restaurants and grocery stores (Redis-cached)."},
    {"name": "AI", "description": "Personalized recommendations and smart-cart suggestions."},
]

app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    description="QuickKart — food & grocery delivery platform API (demo data only).",
    openapi_tags=TAGS,
    lifespan=lifespan,
)
app.add_middleware(RequestLogMiddleware)
app.add_middleware(
    CORSMiddleware, allow_origins=settings.cors_origins, allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"], expose_headers=["X-Request-ID"],
)
register_exception_handlers(app)

API = "/api/v1"
for r in (auth, users, stores, cart, orders, payments, engagement, vendor, delivery, admin):
    app.include_router(r.router, prefix=API)
app.include_router(ws.router)

# Vendor-uploaded product photos (under /api so the dev proxy and nginx already route them here).
uploads.upload_root().mkdir(parents=True, exist_ok=True)
app.mount(uploads.URL_PREFIX, StaticFiles(directory=uploads.upload_root()), name="uploads")


@app.get("/health", tags=["Ops"])
def health():
    db_ok = True
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception:  # noqa: BLE001
        db_ok = False
    return {"status": "ok" if db_ok else "degraded", "database": db_ok, "cache": cache.backend_name}
