from typing import Literal

from fastapi import APIRouter, Query
from sqlalchemy import exists, func, or_, select

from app.core.cache import cache
from app.core.deps import DB, OptionalUser, Pagination
from app.core.exceptions import NotFound
from app.models import Favorite, Product, Review, Store, StoreType
from app.schemas.common import Page
from app.schemas.misc import ReviewOut
from app.schemas.store import ProductOut, StoreDetail, StoreOut
from app.services.geo import delivery_eta, haversine_km

router = APIRouter(prefix="/stores", tags=["Discovery"])

SortKey = Literal["relevance", "rating", "delivery_time", "distance", "price_low", "price_high"]


def store_out(s: Store, lat: float | None, lng: float | None, fav_ids: set[int]) -> StoreOut:
    out = StoreOut.model_validate(s)
    if lat is not None and lng is not None:
        out.distance_km = round(haversine_km(lat, lng, s.lat, s.lng), 1)
        out.eta_minutes = delivery_eta(s.prep_time_min, out.distance_km)
    else:
        out.eta_minutes = s.prep_time_min + 15
    out.is_favorite = s.id in fav_ids
    return out


def favorite_ids(db, user) -> set[int]:
    if not user:
        return set()
    return set(db.scalars(select(Favorite.store_id).where(Favorite.user_id == user.id)))


@router.get("", response_model=Page[StoreOut], summary="Search & filter restaurants and stores")
def list_stores(
    db: DB, user: OptionalUser, pg: Pagination,
    q: str | None = Query(None, max_length=80, description="Matches store name, cuisine or a dish/product"),
    store_type: StoreType | None = None,
    cuisine: str | None = None,
    veg_only: bool = False,
    min_rating: float = Query(0, ge=0, le=5),
    max_price_level: int = Query(4, ge=1, le=4),
    open_now: bool = False,
    max_distance_km: float | None = Query(None, gt=0),
    sort: SortKey = "relevance",
    lat: float | None = Query(None, ge=-90, le=90),
    lng: float | None = Query(None, ge=-180, le=180),
):
    key = f"qk:stores:{q}:{store_type}:{cuisine}:{veg_only}:{min_rating}:{max_price_level}:{open_now}"
    ids = cache.get(key)
    if ids is None:
        stmt = select(Store.id).where(Store.is_approved.is_(True), Store.rating >= min_rating,
                                      Store.price_level <= max_price_level)
        if q:
            like = f"%{q.lower()}%"
            dish = exists().where(Product.store_id == Store.id, func.lower(Product.name).like(like))
            stmt = stmt.where(or_(func.lower(Store.name).like(like), func.lower(Store.cuisines).like(like), dish))
        if store_type:
            stmt = stmt.where(Store.store_type == store_type)
        if cuisine:
            stmt = stmt.where(func.lower(Store.cuisines).like(f"%{cuisine.lower()}%"))
        if veg_only:
            stmt = stmt.where(Store.is_veg_only.is_(True))
        if open_now:
            stmt = stmt.where(Store.is_open.is_(True))
        ids = list(db.scalars(stmt))
        cache.set(key, ids, ttl=120)

    stores = db.scalars(select(Store).where(Store.id.in_(ids))).all() if ids else []
    favs = favorite_ids(db, user)
    items = [store_out(s, lat, lng, favs) for s in stores]
    if max_distance_km and lat is not None:
        items = [s for s in items if s.distance_km is not None and s.distance_km <= max_distance_km]

    sorters = {
        "rating": lambda s: (-s.rating, s.eta_minutes or 0),
        "delivery_time": lambda s: (s.eta_minutes or 0),
        "distance": lambda s: (s.distance_km if s.distance_km is not None else 1e9),
        "price_low": lambda s: (s.price_level, -s.rating),
        "price_high": lambda s: (-s.price_level, -s.rating),
        "relevance": lambda s: (not s.is_open, -(s.rating * 0.7 + min(s.rating_count, 500) / 500 * 1.5)
                                + (s.distance_km or 0) * 0.1),
    }
    items.sort(key=sorters[sort])
    total = len(items)
    return Page.build(items[pg.offset: pg.offset + pg.size], total, pg.page, pg.size)


@router.get("/meta/cuisines", response_model=list[str])
def cuisines(db: DB):
    if (cached := cache.get("qk:stores:cuisines")) is not None:
        return cached
    tags = sorted({c.strip() for row in db.scalars(select(Store.cuisines)) for c in row.split(",") if c.strip()})
    cache.set("qk:stores:cuisines", tags, ttl=600)
    return tags


@router.get("/{store_id}", response_model=StoreDetail)
def store_detail(store_id: int, db: DB, user: OptionalUser,
                 lat: float | None = None, lng: float | None = None):
    s = db.get(Store, store_id)
    if not s or not s.is_approved:
        raise NotFound("Store not found")
    products = db.scalars(
        select(Product).where(Product.store_id == s.id).order_by(Product.id)
    ).all()
    base = store_out(s, lat, lng, favorite_ids(db, user))
    categories = list(dict.fromkeys(p.category for p in products))
    return StoreDetail(**base.model_dump(), products=[ProductOut.model_validate(p) for p in products],
                       categories=categories)


@router.get("/{store_id}/reviews", response_model=Page[ReviewOut])
def store_reviews(store_id: int, db: DB, pg: Pagination):
    base = select(Review).where(Review.store_id == store_id, Review.is_hidden.is_(False))
    total = db.scalar(select(func.count()).select_from(base.subquery()))
    rows = db.scalars(base.order_by(Review.created_at.desc()).offset(pg.offset).limit(pg.size)).all()
    return Page.build(rows, total, pg.page, pg.size)
