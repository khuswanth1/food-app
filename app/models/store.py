import enum

from sqlalchemy import Boolean, Enum, Float, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.mixins import TimestampMixin

Money = Numeric(10, 2, asdecimal=False)


class StoreType(str, enum.Enum):
    RESTAURANT = "restaurant"
    GROCERY = "grocery"


class Store(TimestampMixin, Base):
    __tablename__ = "stores"

    id: Mapped[int] = mapped_column(primary_key=True)
    vendor_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(120), index=True)
    store_type: Mapped[StoreType] = mapped_column(Enum(StoreType, native_enum=False, length=20), index=True)
    description: Mapped[str] = mapped_column(Text, default="")
    cuisines: Mapped[str] = mapped_column(String(255), default="")  # comma separated tags
    image_url: Mapped[str | None] = mapped_column(String(500))
    address: Mapped[str] = mapped_column(String(255))
    city: Mapped[str] = mapped_column(String(80), default="Bengaluru", index=True)
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)
    rating: Mapped[float] = mapped_column(Float, default=0)
    rating_count: Mapped[int] = mapped_column(Integer, default=0)
    prep_time_min: Mapped[int] = mapped_column(Integer, default=20)
    delivery_fee: Mapped[float] = mapped_column(Money, default=30)
    min_order: Mapped[float] = mapped_column(Money, default=0)
    price_level: Mapped[int] = mapped_column(Integer, default=2)  # 1..4
    is_veg_only: Mapped[bool] = mapped_column(Boolean, default=False)
    is_open: Mapped[bool] = mapped_column(Boolean, default=True)
    is_approved: Mapped[bool] = mapped_column(Boolean, default=True, index=True)

    products: Mapped[list["Product"]] = relationship(back_populates="store", cascade="all, delete-orphan")

    @property
    def cuisine_list(self) -> list[str]:
        return [c.strip() for c in self.cuisines.split(",") if c.strip()]


class Product(TimestampMixin, Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(primary_key=True)
    store_id: Mapped[int] = mapped_column(ForeignKey("stores.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120), index=True)
    description: Mapped[str] = mapped_column(Text, default="")
    category: Mapped[str] = mapped_column(String(60), index=True)
    price: Mapped[float] = mapped_column(Money)
    mrp: Mapped[float | None] = mapped_column(Money)
    image_url: Mapped[str | None] = mapped_column(String(500))
    is_veg: Mapped[bool] = mapped_column(Boolean, default=True)
    tags: Mapped[str] = mapped_column(String(255), default="")
    unit: Mapped[str | None] = mapped_column(String(30))  # e.g. "1 kg", "500 ml" for groceries
    stock: Mapped[int] = mapped_column(Integer, default=100)
    low_stock_threshold: Mapped[int] = mapped_column(Integer, default=10)
    is_available: Mapped[bool] = mapped_column(Boolean, default=True)
    # Per-order quantity limits; max_qty None means "no cap beyond stock".
    min_qty: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    max_qty: Mapped[int | None] = mapped_column(Integer)

    store: Mapped[Store] = relationship(back_populates="products")

    @property
    def is_low_stock(self) -> bool:
        return self.stock <= self.low_stock_threshold
