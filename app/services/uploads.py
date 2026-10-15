"""Vendor product photo uploads, stored on local disk and served from /api/v1/uploads.

Files are identified by their bytes, not the client's filename or content type, and only JPEG, PNG and WebP are
accepted (no SVG, which can carry scripts). Names are random, so uploads can't overwrite or guess each other."""
import secrets
from pathlib import Path

from fastapi import UploadFile, status

from app.core.config import settings
from app.core.exceptions import AppError

URL_PREFIX = "/api/v1/uploads"
PRODUCT_DIR = "products"


def upload_root() -> Path:
    return Path(settings.UPLOAD_DIR)


def _image_ext(data: bytes) -> str | None:
    if data.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return ".webp"
    return None


def save_product_image(file: UploadFile) -> str:
    limit = settings.MAX_IMAGE_MB * 1024 * 1024
    data = file.file.read(limit + 1)
    if len(data) > limit:
        raise AppError(f"Image must be {settings.MAX_IMAGE_MB} MB or smaller", code="image_too_large",
                       status_code=status.HTTP_413_CONTENT_TOO_LARGE)
    ext = _image_ext(data)
    if not ext:
        raise AppError("Upload a JPEG, PNG or WebP image", code="invalid_image",
                       status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE)
    folder = upload_root() / PRODUCT_DIR
    folder.mkdir(parents=True, exist_ok=True)
    name = f"{secrets.token_hex(16)}{ext}"
    (folder / name).write_bytes(data)
    return f"{URL_PREFIX}/{PRODUCT_DIR}/{name}"


def delete_uploaded(url: str | None) -> None:
    """Remove a previously uploaded file. Stock (external) URLs are ignored."""
    prefix = f"{URL_PREFIX}/{PRODUCT_DIR}/"
    if not url or not url.startswith(prefix):
        return
    # Path(...).name drops any directory parts, so this can only ever touch files inside the products folder.
    (upload_root() / PRODUCT_DIR / Path(url).name).unlink(missing_ok=True)
