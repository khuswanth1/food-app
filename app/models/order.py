import enum
from datetime import datetime

from sqlalchemy import Enum, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.mixins import TimestampMixin, UTCDateTime, utcnow
from app.models.store import Money, Store
from app.models.user import User


class OrderStatus(str, enum.Enum):
    PLACED = "placed"
    CONFIRMED = "confirmed"
    PREPARING = "preparing"
    READY = "ready"
    PICKED_UP = "picked_up"
    OUT_FOR_DELIVERY = "out_for_delivery"
    DELIVERED = "delivered"
    CANCELLED = "cancelled"


class PaymentStatus(str, enum.Enum):
    PENDING = "pending"
    PAID = "paid"
    FAILED = "failed"
    REFUNDED = "refunded"


def _enum(e):
    return Enum(e, native_enum=False, length=20)


class Order(TimestampMixin, Base):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(primary_key=True)
    order_number: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    store_id: Mapped[int] = mapped_column(ForeignKey("stores.id"), index=True)
    partner_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True)
    status: Mapped[OrderStatus] = mapped_column(_enum(OrderStatus), default=OrderStatus.PLACED, index=True)

    delivery_address: Mapped[str] = mapped_column(String(400))
    delivery_lat: Mapped[float] = mapped_column(Float)
    delivery_lng: Mapped[float] = mapped_column(Float)

    subtotal: Mapped[float] = mapped_column(Money)
    discount: Mapped[float] = mapped_column(Money, default=0)
    delivery_fee: Mapped[float] = mapped_column(Money, default=0)
    tax: Mapped[float] = mapped_column(Money, default=0)
    total: Mapped[float] = mapped_column(Money)
    coupon_code: Mapped[str | None] = mapped_column(String(30))

    payment_method: Mapped[str] = mapped_column(String(20), default="card")
    payment_status: Mapped[PaymentStatus] = mapped_column(_enum(PaymentStatus), default=PaymentStatus.PENDING)

    notes: Mapped[str | None] = mapped_column(Text)
    eta_minutes: Mapped[int | None] = mapped_column(Integer)
    cancel_reason: Mapped[str | None] = mapped_column(String(255))
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow)
    delivered_at: Mapped[datetime | None] = mapped_column(UTCDateTime)

    items: Mapped[list["OrderItem"]] = relationship(back_populates="order", cascade="all, delete-orphan")
    events: Mapped[list["OrderStatusEvent"]] = relationship(
        back_populates="order", cascade="all, delete-orphan", order_by="OrderStatusEvent.id"
    )
    store: Mapped[Store] = relationship()
    customer: Mapped[User] = relationship(foreign_keys=[customer_id])
    partner: Mapped[User | None] = relationship(foreign_keys=[partner_id])


class OrderItem(Base):
    __tablename__ = "order_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    product_id: Mapped[int | None] = mapped_column(ForeignKey("products.id", ondelete="SET NULL"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    price: Mapped[float] = mapped_column(Money)
    quantity: Mapped[int] = mapped_column(Integer)

    order: Mapped[Order] = relationship(back_populates="items")


class OrderStatusEvent(TimestampMixin, Base):
    __tablename__ = "order_status_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    status: Mapped[OrderStatus] = mapped_column(_enum(OrderStatus))
    note: Mapped[str | None] = mapped_column(String(255))

    order: Mapped[Order] = relationship(back_populates="events")


class Payment(TimestampMixin, Base):
    __tablename__ = "payments"

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    amount: Mapped[float] = mapped_column(Money)
    method: Mapped[str] = mapped_column(String(20))
    status: Mapped[PaymentStatus] = mapped_column(_enum(PaymentStatus))
    transaction_ref: Mapped[str] = mapped_column(String(40), unique=True)
    message: Mapped[str | None] = mapped_column(String(255))
    provider: Mapped[str] = mapped_column(String(20), default="mock")  # mock | razorpay | cod
    provider_order_id: Mapped[str | None] = mapped_column(String(40), index=True)
    provider_payment_id: Mapped[str | None] = mapped_column(String(40), unique=True)
