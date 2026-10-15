"""Recommendation engine.

Personalized store/product ranking is a hybrid of:
  * content affinity  — cuisines/categories/tags the user has ordered or favorited (TF-weighted profile)
  * collaborative     — "users who ordered from X also ordered from Y" store co-visitation
  * quality/popularity — Bayesian-smoothed rating and recent order volume
  * context           — distance from the user's default address and time-of-day intent

Smart-cart suggestions blend item-to-item co-purchase counts (market-basket "lift"), the user's own
repeat purchases at the store, and complementary-category rules for cold start. Every suggestion
carries a human-readable reason so the UI can explain itself.
"""
from collections import Counter, defaultdict
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.cache import cache
from app.models import Address, Favorite, Order, OrderItem, OrderStatus, Product, Store, User
from app.services.geo import haversine_km

W_AFFINITY, W_COLLAB, W_QUALITY, W_POPULAR, W_PROXIMITY, W_CONTEXT = 0.32, 0.18, 0.2, 0.12, 0.12, 0.06
GLOBAL_PRIOR_RATING, PRIOR_WEIGHT = 4.0, 5

TIME_INTENTS = [  # (start_hour, end_hour, label, matching keywords)
    (6, 11, "breakfast", {"breakfast", "south indian", "bakery", "cafe", "coffee", "dairy", "bread"}),
    (11, 16, "lunch", {"north indian", "biryani", "thali", "south indian", "chinese", "meals", "rice"}),
    (16, 19, "snacks", {"snacks", "cafe", "bakery", "beverages", "desserts", "chaat", "coffee"}),
    (19, 23, "dinner", {"north indian", "biryani", "pizza", "chinese", "italian", "burgers", "kebabs"}),
    (23, 30, "late night", {"pizza", "burgers", "desserts", "ice cream", "rolls"}),
]

COMPLEMENTS = {
    "main course": ["breads", "rice", "beverages", "desserts"],
    "biryani": ["sides", "beverages", "desserts"],
    "pizza": ["sides", "beverages", "desserts"],
    "burgers": ["sides", "beverages"],
    "breads": ["main course"],
    "starters": ["main course", "beverages"],
    "dairy": ["bakery", "breakfast"],
    "bakery": ["dairy", "spreads"],
    "fruits": ["dairy"],
    "vegetables": ["staples", "spices"],
    "staples": ["spices", "vegetables"],
    "snacks": ["beverages"],
    "beverages": ["snacks"],
}


def _tokens(*texts: str) -> list[str]:
    out = []
    for t in texts:
        out.extend(x.strip().lower() for x in (t or "").split(",") if x.strip())
    return out


def _intent(now: datetime) -> tuple[str, set[str]]:
    hour = now.hour if now.hour >= 6 else now.hour + 24
    for start, end, label, words in TIME_INTENTS:
        if start <= hour < end:
            return label, words
    return "anytime", set()


def _user_profile(db: Session, user: User) -> tuple[Counter, set[int]]:
    """Weighted bag of cuisine/category/tag tokens + set of stores the user ordered from."""
    profile: Counter = Counter()
    rows = db.execute(
        select(Store.id, Store.cuisines, Product.category, Product.tags, OrderItem.quantity)
        .join(Order, Order.store_id == Store.id)
        .join(OrderItem, OrderItem.order_id == Order.id)
        .join(Product, Product.id == OrderItem.product_id)
        .where(Order.customer_id == user.id, Order.status != OrderStatus.CANCELLED)
    ).all()
    visited = set()
    for store_id, cuisines, category, tags, qty in rows:
        visited.add(store_id)
        for tok in _tokens(cuisines):
            profile[tok] += 1
        for tok in _tokens(category, tags):
            profile[tok] += 0.5 * qty
    favs = db.execute(
        select(Store.cuisines).join(Favorite, Favorite.store_id == Store.id).where(Favorite.user_id == user.id)
    ).scalars()
    for cuisines in favs:
        for tok in _tokens(cuisines):
            profile[tok] += 2
    return profile, visited


def _store_popularity(db: Session, days: int = 30) -> dict[int, int]:
    since = datetime.now(UTC) - timedelta(days=days)
    rows = db.execute(
        select(Order.store_id, func.count(Order.id))
        .where(Order.created_at >= since, Order.status != OrderStatus.CANCELLED)
        .group_by(Order.store_id)
    ).all()
    return dict(rows)


def _co_visited_stores(db: Session, visited: set[int]) -> Counter:
    """Stores ordered from by customers who share at least one store with this user."""
    if not visited:
        return Counter()
    peers = select(Order.customer_id).where(Order.store_id.in_(visited)).distinct()
    rows = db.execute(
        select(Order.store_id, func.count(func.distinct(Order.customer_id)))
        .where(Order.customer_id.in_(peers), Order.store_id.not_in(visited))
        .group_by(Order.store_id)
    ).all()
    return Counter(dict(rows))


def recommend_stores(db: Session, user: User | None, limit: int = 8, now: datetime | None = None) -> list[dict]:
    now = now or datetime.now()
    key = f"qk:reco:{user.id if user else 'anon'}:{now.hour}"
    if (cached := cache.get(key)) is not None:
        return cached

    stores = db.scalars(select(Store).where(Store.is_approved.is_(True), Store.is_open.is_(True))).all()
    if not stores:
        return []
    profile, visited = _user_profile(db, user) if user else (Counter(), set())
    collab = _co_visited_stores(db, visited)
    popularity = _store_popularity(db)
    max_pop = max(popularity.values(), default=1) or 1
    max_collab = max(collab.values(), default=1) or 1
    profile_norm = sum(profile.values()) or 1
    intent_label, intent_words = _intent(now)

    home = None
    if user:
        home = db.scalar(select(Address).where(Address.user_id == user.id).order_by(Address.is_default.desc()))

    scored = []
    for s in stores:
        toks = set(_tokens(s.cuisines))
        affinity = sum(profile[t] for t in toks) / profile_norm
        bayes = (s.rating * s.rating_count + GLOBAL_PRIOR_RATING * PRIOR_WEIGHT) / (s.rating_count + PRIOR_WEIGHT)
        quality = bayes / 5
        popular = popularity.get(s.id, 0) / max_pop
        co = collab.get(s.id, 0) / max_collab
        proximity, dist = 0.5, None
        if home:
            dist = haversine_km(home.lat, home.lng, s.lat, s.lng)
            proximity = max(0.0, 1 - dist / 10)
        context = 1.0 if toks & intent_words else 0.0
        score = (W_AFFINITY * min(affinity * 2, 1) + W_COLLAB * co + W_QUALITY * quality
                 + W_POPULAR * popular + W_PROXIMITY * proximity + W_CONTEXT * context)

        top_match = max(toks, key=lambda t: profile[t], default=None)
        if top_match and profile[top_match] > 0:
            reason = f"Because you enjoy {top_match.title()}"
        elif co > 0.3:
            reason = "Loved by people with similar taste"
        elif context:
            reason = f"Great for {intent_label}"
        elif s.rating >= 4.4:
            reason = "Top rated"
        elif popular > 0.5:
            reason = "Trending near you"
        else:
            reason = "Recommended for you"
        scored.append({"store_id": s.id, "score": round(score, 4), "reason": reason,
                       "distance_km": round(dist, 1) if dist is not None else None})

    scored.sort(key=lambda x: x["score"], reverse=True)
    result = scored[:limit]
    cache.set(key, result, ttl=300)
    return result


def recommend_products(db: Session, user: User, limit: int = 10) -> list[dict]:
    """Reorder-style picks: user's most-ordered items plus best sellers in their favourite categories."""
    rows = db.execute(
        select(OrderItem.product_id, func.sum(OrderItem.quantity))
        .join(Order, Order.id == OrderItem.order_id)
        .where(Order.customer_id == user.id, OrderItem.product_id.is_not(None))
        .group_by(OrderItem.product_id)
        .order_by(func.sum(OrderItem.quantity).desc())
        .limit(limit)
    ).all()
    out, seen = [], set()
    for pid, qty in rows:
        p = db.get(Product, pid)
        if p and p.is_available and p.stock > 0:
            out.append({"product": p, "reason": f"You've ordered this {int(qty)}×"})
            seen.add(pid)
    profile, _ = _user_profile(db, user)
    top_cats = [c for c, _ in profile.most_common(5)]
    if len(out) < limit and top_cats:
        best = db.execute(
            select(Product, func.coalesce(func.sum(OrderItem.quantity), 0).label("sold"))
            .outerjoin(OrderItem, OrderItem.product_id == Product.id)
            .where(func.lower(Product.category).in_(top_cats), Product.is_available.is_(True), Product.stock > 0)
            .group_by(Product.id)
            .order_by(func.coalesce(func.sum(OrderItem.quantity), 0).desc())
            .limit(limit * 2)
        ).all()
        for p, _sold in best:
            if p.id not in seen and len(out) < limit:
                out.append({"product": p, "reason": f"Popular in {p.category}"})
                seen.add(p.id)
    return out


def smart_cart(db: Session, user: User, cart_product_ids: list[int], limit: int = 6) -> list[dict]:
    if not cart_product_ids:
        return []
    cart_products = [db.get(Product, pid) for pid in cart_product_ids]
    store_id = cart_products[0].store_id
    in_cart = set(cart_product_ids)
    candidates = {
        p.id: p for p in db.scalars(
            select(Product).where(Product.store_id == store_id, Product.is_available.is_(True),
                                  Product.stock > 0, Product.id.not_in(in_cart))
        )
    }
    if not candidates:
        return []
    scores: dict[int, float] = defaultdict(float)
    reasons: dict[int, str] = {}

    # 1) Item-to-item co-purchase with lift = P(B|A) / P(B)
    total_orders = db.scalar(select(func.count(Order.id)).where(Order.store_id == store_id)) or 1
    baskets = select(OrderItem.order_id).where(OrderItem.product_id.in_(in_cart)).distinct()
    n_baskets = db.scalar(select(func.count()).select_from(baskets.subquery())) or 0
    if n_baskets:
        co = db.execute(
            select(OrderItem.product_id, func.count(func.distinct(OrderItem.order_id)))
            .where(OrderItem.order_id.in_(baskets), OrderItem.product_id.in_(candidates.keys()))
            .group_by(OrderItem.product_id)
        ).all()
        support = dict(db.execute(
            select(OrderItem.product_id, func.count(func.distinct(OrderItem.order_id)))
            .where(OrderItem.product_id.in_([pid for pid, _ in co]))
            .group_by(OrderItem.product_id)
        ).all())
        for pid, together in co:
            confidence = together / n_baskets
            lift = confidence / max(support.get(pid, 1) / total_orders, 1e-6)
            scores[pid] += confidence * 2 + min(lift, 5) * 0.2
            reasons[pid] = f"Frequently bought together ({round(confidence * 100)}% of baskets)"

    # 2) Personal repeat purchases at this store
    mine = db.execute(
        select(OrderItem.product_id, func.sum(OrderItem.quantity))
        .join(Order, Order.id == OrderItem.order_id)
        .where(Order.customer_id == user.id, OrderItem.product_id.in_(candidates.keys()))
        .group_by(OrderItem.product_id)
    ).all()
    for pid, qty in mine:
        scores[pid] += 0.8 + min(qty, 5) * 0.1
        reasons.setdefault(pid, "You usually add this")

    # 3) Complementary categories (cold start)
    cart_cats = {p.category.lower() for p in cart_products}
    wanted = {c for cat in cart_cats for c in COMPLEMENTS.get(cat, [])} - cart_cats
    for pid, p in candidates.items():
        if p.category.lower() in wanted:
            scores[pid] += 0.5
            reasons.setdefault(pid, f"Pairs well with your {next(iter(cart_cats)).title()}")

    ranked = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)[:limit]
    return [{"product": candidates[pid], "reason": reasons[pid], "score": round(s, 3)} for pid, s in ranked]
