from datetime import datetime

from pydantic import BaseModel, Field, field_validator, model_validator

from app.models import StoreType
from app.schemas.common import ORM


class StoreBase(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    store_type: StoreType
    description: str = Field(default="", max_length=2000)
    cuisines: list[str] = Field(default_factory=list, max_length=10)
    image_url: str | None = None
    address: str = Field(min_length=3, max_length=255)
    city: str = "Bengaluru"
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    prep_time_min: int = Field(default=20, ge=1, le=180)
    delivery_fee: float = Field(default=30, ge=0, le=500)
    min_order: float = Field(default=0, ge=0)
    price_level: int = Field(default=2, ge=1, le=4)
    is_veg_only: bool = False
    is_open: bool = True


class StoreIn(StoreBase):
    pass


class StoreUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    description: str | None = None
    cuisines: list[str] | None = None
    image_url: str | None = None
    address: str | None = None
    prep_time_min: int | None = Field(default=None, ge=1, le=180)
    delivery_fee: float | None = Field(default=None, ge=0, le=500)
    min_order: float | None = Field(default=None, ge=0)
    price_level: int | None = Field(default=None, ge=1, le=4)
    is_veg_only: bool | None = None
    is_open: bool | None = None


class StoreOut(ORM, StoreBase):
    id: int
    vendor_id: int
    rating: float
    rating_count: int
    is_approved: bool
    created_at: datetime
    distance_km: float | None = None
    eta_minutes: int | None = None
    is_favorite: bool = False

    @field_validator("cuisines", mode="before")
    @classmethod
    def split_cuisines(cls, v):
        if isinstance(v, str):
            return [c.strip() for c in v.split(",") if c.strip()]
        return v


class ProductBase(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    description: str = Field(default="", max_length=1000)
    category: str = Field(min_length=2, max_length=60)
    price: float = Field(gt=0, le=100000)
    mrp: float | None = Field(default=None, gt=0)
    image_url: str | None = None
    is_veg: bool = True
    tags: list[str] = Field(default_factory=list)
    unit: str | None = None
    stock: int = Field(default=100, ge=0)
    low_stock_threshold: int = Field(default=10, ge=0)
    is_available: bool = True
    min_qty: int = Field(default=1, ge=1, le=50)
    max_qty: int | None = Field(default=None, ge=1, le=50)


def _check_image_url(v: str | None) -> str | None:
    """Only web images or our own uploads (no javascript:/data: URLs)."""
    if v and not v.startswith(("https://", "http://", "/api/v1/uploads/")):
        raise ValueError("image_url must be an http(s) URL or an uploaded image")
    return v


class ProductIn(ProductBase):
    _image_url = field_validator("image_url")(_check_image_url)

    @model_validator(mode="after")
    def check_qty_limits(self):
        if self.max_qty is not None and self.max_qty < self.min_qty:
            raise ValueError("max_qty must be greater than or equal to min_qty")
        return self


class ProductUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    description: str | None = None
    category: str | None = None
    price: float | None = Field(default=None, gt=0, le=100000)
    mrp: float | None = None
    image_url: str | None = None
    is_veg: bool | None = None
    tags: list[str] | None = None
    unit: str | None = None
    stock: int | None = Field(default=None, ge=0)
    low_stock_threshold: int | None = Field(default=None, ge=0)
    is_available: bool | None = None
    min_qty: int | None = Field(default=None, ge=1, le=50)
    max_qty: int | None = Field(default=None, ge=1, le=50)  # send null to remove the cap

    _image_url = field_validator("image_url")(_check_image_url)


class StockUpdate(BaseModel):
    stock: int = Field(ge=0)


class ProductOut(ORM, ProductBase):
    id: int
    store_id: int
    is_low_stock: bool

    @field_validator("tags", mode="before")
    @classmethod
    def split_tags(cls, v):
        if isinstance(v, str):
            return [t.strip() for t in v.split(",") if t.strip()]
        return v


class StoreDetail(StoreOut):
    products: list[ProductOut]
    categories: list[str]
