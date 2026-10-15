"""One-shot schema creation + demo seeding.

Run as ``python -m app.bootstrap`` before starting multiple workers (the Docker image does this), so
workers don't race each other. Single-process dev servers call it from the app lifespan instead.
For production schema evolution, swap ``create_all`` for Alembic migrations.
"""
import logging

from sqlalchemy import inspect, text

from app.core.config import settings
from app.core.database import Base, SessionLocal, engine
from app.product_photos import PRODUCT_PHOTOS, stock_photo
from app.seed import seed

log = logging.getLogger("quickkart.bootstrap")


# Columns added after the first release. create_all() never alters existing tables, so add them in place.
ADDED_COLUMNS = {
    "products": {
        "min_qty": "INTEGER NOT NULL DEFAULT 1",
        "max_qty": "INTEGER",
    },
    "users": {
        "google_sub": "VARCHAR(255)",
    },
}


def upgrade_columns() -> None:
    insp = inspect(engine)
    with engine.begin() as conn:
        for table, columns in ADDED_COLUMNS.items():
            if not insp.has_table(table):
                continue
            existing = {c["name"] for c in insp.get_columns(table)}
            for name, ddl in columns.items():
                if name not in existing:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}"))
                    log.info("Added column %s.%s", table, name)


def backfill_product_photos() -> None:
    """Give demo products their stock photo. Only fills empty images, so vendor uploads are never replaced."""
    with engine.begin() as conn:
        filled = 0
        for name, photo in PRODUCT_PHOTOS.items():
            filled += conn.execute(text("UPDATE products SET image_url = :url WHERE name = :name AND image_url IS NULL"),
                                   {"url": stock_photo(name), "name": name}).rowcount
    if filled:
        log.info("Added stock photos to %d products", filled)


def bootstrap() -> None:
    Base.metadata.create_all(engine)
    upgrade_columns()
    backfill_product_photos()
    if settings.SEED_ON_STARTUP:
        with SessionLocal() as db:
            if seed(db):
                log.info("Seeded demo data")


if __name__ == "__main__":
    logging.basicConfig(level="INFO")
    bootstrap()
