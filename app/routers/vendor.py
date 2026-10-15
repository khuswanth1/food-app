from fastapi import APIRouter, File, UploadFile, status
from sqlalchemy import func, select

from app.core.cache import cache
from app.core.deps import DB, Pagination, VendorUser
from app.core.exceptions import AppError, NotFound
from app.models import Order, OrderStatus, Product, Store
from app.routers.orders import ORDER_LOAD, load_order
from app.schemas.common import Message, Page
from app.schemas.order import OrderOut, StatusUpdate
from app.schemas.store import ProductIn, ProductOut, ProductUpdate, StockUpdate, StoreIn, StoreOut, StoreUpdate
from app.product_photos import stock_photo
from app.services import analytics
from app.services import uploads
from app.services import orders as order_svc
from app.services.notify import audit, notify

router = APIRouter(prefix="/vendor", tags=["Vendor"])


def _own_store(db, vendor, store_id) -> Store:
    s = db.get(Store, store_id)
    if not s or s.vendor_id != vendor.id:
        raise NotFound("Store not found")
    return s


def _own_product(db, vendor, product_id) -> Product:
    p = db.get(Product, product_id)
    if not p or p.store.vendor_id != vendor.id:
        raise NotFound("Product not found")
    return p


def _store_ids(db, vendor) -> list[int]:
    return list(db.scalars(select(Store.id).where(Store.vendor_id == vendor.id)))


def _bust():
    cache.invalidate("qk:stores:")
    cache.invalidate("qk:reco:")


# ---- stores ------------------------------------------------------------------
@router.get("/stores", response_model=list[StoreOut])
def my_stores(vendor: VendorUser, db: DB):
    return db.scalars(select(Store).where(Store.vendor_id == vendor.id).order_by(Store.id)).all()


@router.post("/stores", response_model=StoreOut, status_code=status.HTTP_201_CREATED)
def create_store(body: StoreIn, vendor: VendorUser, db: DB):
    data = body.model_dump()
    data["cuisines"] = ",".join(data["cuisines"])
    # New stores need admin approval before they show up in discovery
    s = Store(vendor_id=vendor.id, is_approved=False, **data)
    db.add(s)
    db.flush()
    audit(db, vendor.id, "store.created", "store", s.id, {"name": s.name})
    db.commit()
    return s


@router.patch("/stores/{store_id}", response_model=StoreOut)
def update_store(store_id: int, body: StoreUpdate, vendor: VendorUser, db: DB):
    s = _own_store(db, vendor, store_id)
    data = body.model_dump(exclude_unset=True)
    if "cuisines" in data and data["cuisines"] is not None:
        data["cuisines"] = ",".join(data["cuisines"])
    for k, v in data.items():
        setattr(s, k, v)
    audit(db, vendor.id, "store.updated", "store", s.id, {"fields": list(data)})
    db.commit()
    _bust()
    return s


@router.delete("/stores/{store_id}", response_model=Message)
def delete_store(store_id: int, vendor: VendorUser, db: DB):
    s = _own_store(db, vendor, store_id)
    if db.scalar(select(Order.id).where(Order.store_id == s.id).limit(1)):
        # Preserve order history: deactivate instead of deleting
        s.is_open = False
        s.is_approved = False
        msg = "Store has order history, so it was deactivated instead of deleted"
    else:
        db.delete(s)
        msg = "Store deleted"
    audit(db, vendor.id, "store.deleted", "store", store_id)
    db.commit()
    _bust()
    return Message(message=msg)


# ---- products & inventory ----------------------------------------------------
@router.get("/stores/{store_id}/products", response_model=list[ProductOut])
def store_products(store_id: int, vendor: VendorUser, db: DB):
    _own_store(db, vendor, store_id)
    return db.scalars(select(Product).where(Product.store_id == store_id).order_by(Product.category, Product.name)).all()


@router.post("/stores/{store_id}/products", response_model=ProductOut, status_code=status.HTTP_201_CREATED)
def create_product(store_id: int, body: ProductIn, vendor: VendorUser, db: DB):
    _own_store(db, vendor, store_id)
    data = body.model_dump()
    data["tags"] = ",".join(data["tags"])
    p = Product(store_id=store_id, **data)
    db.add(p)
    db.flush()
    audit(db, vendor.id, "product.created", "product", p.id, {"name": p.name})
    db.commit()
    _bust()
    return p


@router.patch("/products/{product_id}", response_model=ProductOut)
def update_product(product_id: int, body: ProductUpdate, vendor: VendorUser, db: DB):
    p = _own_product(db, vendor, product_id)
    data = body.model_dump(exclude_unset=True)
    if data.get("tags") is not None:
        data["tags"] = ",".join(data["tags"])
    if data.get("min_qty", 1) is None:
        data.pop("min_qty")  # the minimum can't be cleared, only changed
    min_qty = data.get("min_qty", p.min_qty)
    max_qty = data.get("max_qty", p.max_qty)
    if max_qty is not None and max_qty < min_qty:
        raise AppError("Maximum quantity must be at least the minimum quantity", code="invalid_qty_limits")
    for k, v in data.items():
        setattr(p, k, v)
    audit(db, vendor.id, "product.updated", "product", p.id, {"fields": list(data)})
    db.commit()
    _bust()
    return p


@router.post("/products/{product_id}/image", response_model=ProductOut)
def upload_product_image(product_id: int, vendor: VendorUser, db: DB, file: UploadFile = File(...)):
    p = _own_product(db, vendor, product_id)
    old, p.image_url = p.image_url, uploads.save_product_image(file)
    audit(db, vendor.id, "product.image_uploaded", "product", p.id)
    db.commit()
    uploads.delete_uploaded(old)
    _bust()
    return p


@router.delete("/products/{product_id}/image", response_model=ProductOut)
def remove_product_image(product_id: int, vendor: VendorUser, db: DB):
    """Drop the vendor's photo; demo items fall back to their stock photo."""
    p = _own_product(db, vendor, product_id)
    old, p.image_url = p.image_url, stock_photo(p.name)
    audit(db, vendor.id, "product.image_removed", "product", p.id)
    db.commit()
    uploads.delete_uploaded(old)
    _bust()
    return p


@router.put("/products/{product_id}/stock", response_model=ProductOut)
def set_stock(product_id: int, body: StockUpdate, vendor: VendorUser, db: DB):
    p = _own_product(db, vendor, product_id)
    old = p.stock
    p.stock = body.stock
    if p.is_low_stock:
        notify(db, vendor.id, "Low stock alert", f"{p.name} has only {p.stock} left", kind="stock",
               link="/vendor/products")
    audit(db, vendor.id, "inventory.updated", "product", p.id, {"from": old, "to": body.stock})
    db.commit()
    return p


@router.delete("/products/{product_id}", response_model=Message)
def delete_product(product_id: int, vendor: VendorUser, db: DB):
    p = _own_product(db, vendor, product_id)
    db.delete(p)
    audit(db, vendor.id, "product.deleted", "product", product_id)
    db.commit()
    _bust()
    return Message(message="Product deleted")


@router.get("/inventory/low-stock", response_model=list[ProductOut])
def low_stock(vendor: VendorUser, db: DB):
    return db.scalars(select(Product).where(Product.store_id.in_(_store_ids(db, vendor) or [-1]),
                                            Product.stock <= Product.low_stock_threshold)
                      .order_by(Product.stock)).all()


# ---- orders ------------------------------------------------------------------
@router.get("/orders", response_model=Page[OrderOut])
def vendor_orders(vendor: VendorUser, db: DB, pg: Pagination, status: OrderStatus | None = None,
                  store_id: int | None = None):
    ids = [store_id] if store_id else _store_ids(db, vendor)
    if store_id:
        _own_store(db, vendor, store_id)
    base = select(Order).where(Order.store_id.in_(ids or [-1]))
    if status:
        base = base.where(Order.status == status)
    total = db.scalar(select(func.count()).select_from(base.subquery()))
    rows = db.scalars(base.options(*ORDER_LOAD).order_by(Order.created_at.desc())
                      .offset(pg.offset).limit(pg.size)).all()
    return Page.build(rows, total, pg.page, pg.size)


@router.post("/orders/{order_id}/status", response_model=OrderOut)
def vendor_status(order_id: int, body: StatusUpdate, vendor: VendorUser, db: DB):
    order = load_order(db, order_id, vendor)
    return order_svc.vendor_update_status(db, vendor, order, body.status, body.note)


# ---- analytics ---------------------------------------------------------------
@router.get("/analytics")
def vendor_analytics(vendor: VendorUser, db: DB, days: int = 14):
    ids = _store_ids(db, vendor)
    stores = db.scalars(select(Store).where(Store.id.in_(ids or [-1]))).all()
    low = db.scalar(select(func.count(Product.id)).where(Product.store_id.in_(ids or [-1]),
                                                         Product.stock <= Product.low_stock_threshold))
    return {
        "totals": analytics.totals(db, ids),
        "daily": analytics.daily_series(db, days, ids),
        "status_breakdown": analytics.status_breakdown(db, ids),
        "top_products": analytics.top_products(db, ids),
        "low_stock_count": low,
        "stores": [{"id": s.id, "name": s.name, "rating": s.rating, "rating_count": s.rating_count,
                    "is_open": s.is_open, "is_approved": s.is_approved} for s in stores],
    }
