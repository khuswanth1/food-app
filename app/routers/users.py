from fastapi import APIRouter, Query, status
from sqlalchemy import select, update

from app.core.deps import DB, CurrentUser
from app.core.exceptions import AppError, NotFound
from app.core.security import hash_password, verify_password
from app.models import Address
from app.schemas.common import Message
from app.schemas.user import AddressIn, AddressOut, PasswordChange, ProfileUpdate, ReverseGeocodeOut, UserOut
from app.services import geocode

router = APIRouter(prefix="/users/me", tags=["Profile & Addresses"])


@router.patch("", response_model=UserOut)
def update_profile(body: ProfileUpdate, user: CurrentUser, db: DB):
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(user, k, v)
    db.commit()
    return user


@router.post("/password", response_model=Message)
def change_password(body: PasswordChange, user: CurrentUser, db: DB):
    if not verify_password(body.current_password, user.password_hash):
        raise AppError("Current password is incorrect", code="wrong_password")
    user.password_hash = hash_password(body.new_password)
    db.commit()
    return Message(message="Password updated")


@router.get("/reverse-geocode", response_model=ReverseGeocodeOut)
def reverse_geocode(user: CurrentUser, lat: float = Query(ge=-90, le=90), lng: float = Query(ge=-180, le=180)):
    """Turn the device's GPS position into a street address to prefill the address form."""
    return geocode.reverse(lat, lng)


@router.get("/addresses", response_model=list[AddressOut])
def list_addresses(user: CurrentUser, db: DB):
    return db.scalars(
        select(Address).where(Address.user_id == user.id).order_by(Address.is_default.desc(), Address.id)
    ).all()


def _get_own(db, user, address_id) -> Address:
    a = db.get(Address, address_id)
    if not a or a.user_id != user.id:
        raise NotFound("Address not found")
    return a


def _make_default(db, user, address: Address):
    db.execute(update(Address).where(Address.user_id == user.id).values(is_default=False))
    address.is_default = True


@router.post("/addresses", response_model=AddressOut, status_code=status.HTTP_201_CREATED)
def create_address(body: AddressIn, user: CurrentUser, db: DB):
    first = db.scalar(select(Address.id).where(Address.user_id == user.id)) is None
    a = Address(user_id=user.id, **body.model_dump(exclude={"is_default"}))
    db.add(a)
    db.flush()
    if body.is_default or first:
        _make_default(db, user, a)
    db.commit()
    return a


@router.put("/addresses/{address_id}", response_model=AddressOut)
def update_address(address_id: int, body: AddressIn, user: CurrentUser, db: DB):
    a = _get_own(db, user, address_id)
    for k, v in body.model_dump(exclude={"is_default"}).items():
        setattr(a, k, v)
    if body.is_default:
        _make_default(db, user, a)
    db.commit()
    return a


@router.delete("/addresses/{address_id}", response_model=Message)
def delete_address(address_id: int, user: CurrentUser, db: DB):
    db.delete(_get_own(db, user, address_id))
    db.commit()
    return Message(message="Address removed")
