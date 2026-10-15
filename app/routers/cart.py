from fastapi import APIRouter

from app.core.deps import DB, CustomerUser
from app.schemas.order import CartAdd, CartOut, CartQty, CouponApply
from app.services import cart as svc
from app.core.exceptions import AppError

router = APIRouter(prefix="/cart", tags=["Cart"])


@router.get("", response_model=CartOut)
def get_cart(user: CustomerUser, db: DB, coupon: str | None = None):
    return svc.summarize(db, user, coupon)


@router.post("/items", response_model=CartOut)
def add_item(body: CartAdd, user: CustomerUser, db: DB):
    svc.add_to_cart(db, user, body.product_id, body.quantity, body.replace_cart)
    return svc.summarize(db, user)


@router.patch("/items/{item_id}", response_model=CartOut)
def update_item(item_id: int, body: CartQty, user: CustomerUser, db: DB):
    svc.set_quantity(db, user, item_id, body.quantity)
    return svc.summarize(db, user)


@router.delete("/items/{item_id}", response_model=CartOut)
def remove_item(item_id: int, user: CustomerUser, db: DB):
    svc.set_quantity(db, user, item_id, 0)
    return svc.summarize(db, user)


@router.delete("", response_model=CartOut)
def clear(user: CustomerUser, db: DB):
    svc.clear_cart(db, user)
    return svc.summarize(db, user)


@router.post("/coupon", response_model=CartOut, summary="Validate a coupon against the current cart")
def apply_coupon(body: CouponApply, user: CustomerUser, db: DB):
    summary = svc.summarize(db, user)
    if not summary["items"]:
        raise AppError("Your cart is empty", code="cart_empty")
    svc.evaluate_coupon(db, body.code, summary["subtotal"], summary["store_id"])  # raises with specific reason
    return svc.summarize(db, user, body.code)
