from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field

from app.models import Role
from app.schemas.common import ORM


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=2, max_length=120)
    phone: str | None = Field(default=None, pattern=r"^\+?[0-9 ]{7,20}$")
    # Admin accounts can only be created via seed / by another admin
    role: Literal["customer", "vendor", "delivery"] = "customer"


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class RefreshIn(BaseModel):
    refresh_token: str


class GoogleExchangeIn(BaseModel):
    ticket: str


class UserOut(ORM):
    id: int
    email: EmailStr
    full_name: str
    phone: str | None
    role: Role
    is_active: bool
    avatar_url: str | None
    is_online: bool
    created_at: datetime


class TokenOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserOut


class ProfileUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=120)
    phone: str | None = Field(default=None, pattern=r"^\+?[0-9 ]{7,20}$")
    avatar_url: str | None = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


class AddressIn(BaseModel):
    label: str = Field(default="Home", max_length=40)
    line1: str = Field(min_length=3, max_length=255)
    city: str = Field(min_length=2, max_length=80)
    pincode: str = Field(pattern=r"^[0-9A-Za-z -]{3,12}$")
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    is_default: bool = False


class ReverseGeocodeOut(BaseModel):
    line1: str
    city: str
    pincode: str
    display_name: str


class AddressOut(ORM, AddressIn):
    id: int
