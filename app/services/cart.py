from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.config import settings
from app.core.exceptions import AppError, Conflict, NotFound
from app.models import CartItem, Coupon, Product, Store, User


def cart_items(db: Session, user: User) -> list[CartItem]:
    stmt = (
        select(CartItem)
        .where(CartItem.user_id == user.id)
        .options(joinedload(CartItem.product).joinedload(Product.store))
        .order_by(CartItem.id)
    )
    return list(db.scalars(stmt).unique())


def check_qty_limits(product: Product, quantity: int) -> None:
    """Per-product order limits set by the vendor (stock is checked separately)."""
    if quantity < product.min_qty:
        raise AppError(f"Minimum order for {product.name} is {product.min_qty}", code="below_min_qty")
    if product.max_qty is not None and quantity > product.max_qty:
        raise AppError(f"You can order at most {product.max_qty} of {product.name}", code="above_max_qty")


def _check_quantity(product: Product, quantity: int) -> None:
    check_qty_limits(product, quantity)
    if quantity > product.stock:
        raise AppError(f"Only {product.stock} left in stock", code="insufficient_stock")


def add_to_cart(db: Session, user: User, product_id: int, quantity: int, replace_cart: bool) -> None:
    product = db.get(Product, product_id)
    if not product or not product.is_available:
        raise NotFound("Product not available")
    store = product.store
    if not store.is_open or not store.is_approved:
        raise AppError("This store is not accepting orders right now", code="store_closed")

    items = cart_items(db, user)
    other_store = next((i for i in items if i.product.store_id != product.store_id), None)
    if other_store:
        if not replace_cart:
            raise Conflict(
                f"Your cart has items from {other_store.product.store.name}. Replace them?",
                code="cart_store_conflict",
            )
        for i in items:
            db.delete(i)
        db.flush()
        items = []

    existing = next((i for i in items if i.product_id == product_id), None)
    # A first add is raised to the product's minimum, so "ADD" on a "min 2" item adds two.
    new_qty = existing.quantity + quantity if existing else max(quantity, product.min_qty)
    _check_quantity(product, new_qty)
    if existing:
        existing.quantity = new_qty
    else:
        db.add(CartItem(user_id=user.id, product_id=product_id, quantity=new_qty))
    db.commit()


def set_quantity(db: Session, user: User, item_id: int, quantity: int) -> None:
    item = db.get(CartItem, item_id)
    if not item or item.user_id != user.id:
        raise NotFound("Cart item not found")
    if quantity == 0:
        db.delete(item)
    else:
        _check_quantity(item.product, quantity)
        item.quantity = quantity
    db.commit()


def clear_cart(db: Session, user: User) -> None:
    for i in cart_items(db, user):
        db.delete(i)
    db.commit()


def _aware(dt: datetime | None) -> datetime | None:
    if dt is not None and dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt


def evaluate_coupon(db: Session, code: str, subtotal: float, store_id: int | None) -> tuple[Coupon, float]:
    """Return (coupon, discount) or raise AppError with a user-facing reason."""
    coupon = db.scalar(select(Coupon).where(Coupon.code == code.strip().upper()))
    if not coupon or not coupon.is_active:
        raise AppError("Invalid coupon code", code="coupon_invalid")
    if coupon.valid_until and _aware(coupon.valid_until) < datetime.now(UTC):
        raise AppError("This coupon has expired", code="coupon_expired")
    if coupon.usage_limit is not None and coupon.used_count >= coupon.usage_limit:
        raise AppError("This coupon has reached its usage limit", code="coupon_exhausted")
    if coupon.store_id and coupon.store_id != store_id:
        raise AppError("Coupon not valid for this store", code="coupon_store")
    if subtotal < coupon.min_order:
        raise AppError(f"Add ₹{coupon.min_order - subtotal:.0f} more to use this coupon", code="coupon_min_order")
    if coupon.discount_type == "percent":
        discount = subtotal * coupon.value / 100
        if coupon.max_discount:
            discount = min(discount, coupon.max_discount)
    else:
        discount = coupon.value
    return coupon, round(min(discount, subtotal), 2)


def summarize(db: Session, user: User, coupon_code: str | None = None) -> dict:
    items = cart_items(db, user)
    store: Store | None = items[0].product.store if items else None
    subtotal = round(sum(i.product.price * i.quantity for i in items), 2)
    delivery_fee = float(store.delivery_fee) if store else 0.0
    discount, coupon_message, applied = 0.0, None, None
    if coupon_code and items:
        try:
            coupon, discount = evaluate_coupon(db, coupon_code, subtotal, store.id)
            applied = coupon.code
            coupon_message = f"{coupon.code} applied — you save ₹{discount:.0f}"
        except AppError as e:
            coupon_message = e.message
    tax = round((subtotal - discount) * settings.TAX_RATE, 2)
    total = round(subtotal - discount + delivery_fee + tax, 2) if items else 0.0
    return {
        "store_id": store.id if store else None,
        "store_name": store.name if store else None,
        "min_order": float(store.min_order) if store else 0,
        "items": [
            {"id": i.id, "quantity": i.quantity, "product": i.product, "line_total": round(i.product.price * i.quantity, 2)}
            for i in items
        ],
        "subtotal": subtotal,
        "delivery_fee": delivery_fee if items else 0.0,
        "tax": tax if items else 0.0,
        "discount": discount,
        "total": total,
        "coupon_code": applied,
        "coupon_message": coupon_message,
    }
