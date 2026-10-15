from math import ceil
from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict

T = TypeVar("T")


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    size: int
    pages: int

    @classmethod
    def build(cls, items, total: int, page: int, size: int):
        return cls(items=items, total=total, page=page, size=size, pages=max(1, ceil(total / size)))


class Message(BaseModel):
    message: str
