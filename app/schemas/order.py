from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.models import OrderStatus, PaymentStatus
from app.schemas.common import ORM
from app.schemas.store import ProductOut


class CartAdd(BaseModel):
    product_id: int
    quantity: int = Field(default=1, ge=1, le=50)
    replace_cart: bool = False  # clear items from another store first


class CartQty(BaseModel):
    quantity: int = Field(ge=0, le=50)


class CartLine(ORM):
    id: int
    quantity: int
    product: ProductOut
    line_total: float


class CartOut(BaseModel):
    store_id: int | None
    store_name: str | None
    items: list[CartLine]
    subtotal: float
    delivery_fee: float
    tax: float
    discount: float
    total: float
    coupon_code: str | None = None
    coupon_message: str | None = None
    min_order: float = 0


class CouponApply(BaseModel):
    code: str


class CheckoutIn(BaseModel):
    address_id: int
    payment_method: Literal["card", "upi", "wallet", "cod"] = "card"
    coupon_code: str | None = None
    notes: str | None = Field(default=None, max_length=500)


class PaymentIn(BaseModel):
    # Mock gateway: no real card data is ever accepted. `simulate_failure` lets demos exercise the failure path.
    simulate_failure: bool = False


class PaymentOut(ORM):
    id: int
    order_id: int
    amount: float
    method: str
    status: PaymentStatus
    transaction_ref: str
    message: str | None
    provider: str
    provider_payment_id: str | None
    created_at: datetime


class RazorpayCheckoutOut(BaseModel):
    key_id: str
    razorpay_order_id: str
    amount: int  # paise
    currency: str
    name: str
    description: str
    order_id: int
    method: str
    prefill: dict[str, str]


class RazorpayVerifyIn(BaseModel):
    razorpay_order_id: str = Field(max_length=40)
    razorpay_payment_id: str = Field(max_length=40)
    razorpay_signature: str = Field(max_length=128)


class RazorpayFailureIn(BaseModel):
    razorpay_order_id: str = Field(max_length=40)
    reason: str = Field(default="Payment failed", max_length=255)


class OrderItemOut(ORM):
    id: int
    product_id: int | None
    name: str
    price: float
    quantity: int


class StatusEventOut(ORM):
    status: OrderStatus
    note: str | None
    created_at: datetime


class StoreMini(ORM):
    id: int
    name: str
    address: str
    lat: float
    lng: float
    store_type: str


class PersonMini(ORM):
    id: int
    full_name: str
    phone: str | None
    current_lat: float | None = None
    current_lng: float | None = None


class OrderOut(ORM):
    id: int
    order_number: str
    status: OrderStatus
    customer_id: int
    store_id: int
    partner_id: int | None
    delivery_address: str
    delivery_lat: float
    delivery_lng: float
    subtotal: float
    discount: float
    delivery_fee: float
    tax: float
    total: float
    coupon_code: str | None
    payment_method: str
    payment_status: PaymentStatus
    notes: str | None
    eta_minutes: int | None
    cancel_reason: str | None
    created_at: datetime
    delivered_at: datetime | None
    items: list[OrderItemOut]
    store: StoreMini
    customer: PersonMini | None = None
    partner: PersonMini | None = None


class OrderDetail(OrderOut):
    events: list[StatusEventOut]
    has_review: bool = False


class CancelIn(BaseModel):
    reason: str = Field(default="Changed my mind", max_length=255)


class StatusUpdate(BaseModel):
    status: OrderStatus
    note: str | None = Field(default=None, max_length=255)


class LocationIn(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
