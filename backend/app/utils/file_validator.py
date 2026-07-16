"""Strict upload validation: size, extension, and magic-byte MIME checks."""

from pathlib import Path

from fastapi import HTTPException, UploadFile, status

# Extension → accepted magic-byte prefixes (file content must start with one of these).
# .docx / .pptx are ZIP containers (PK\\x03\\x04). .ppt is legacy OLE Compound File.
_MAGIC_BY_EXTENSION: dict[str, list[bytes]] = {
    ".pdf": [b"%PDF-"],
    ".docx": [b"PK\x03\x04"],
    ".pptx": [b"PK\x03\x04"],
    ".ppt": [b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"],
    ".jpg": [b"\xff\xd8\xff"],
    ".jpeg": [b"\xff\xd8\xff"],
    ".png": [b"\x89PNG\r\n\x1a\n"],
    ".gif": [b"GIF87a", b"GIF89a"],
    ".webp": [b"RIFF"],  # full check: RIFF....WEBP at offset 8
}


def _matches_magic(ext: str, header: bytes) -> bool:
    signatures = _MAGIC_BY_EXTENSION.get(ext)
    if not signatures:
        return False
    if not any(header.startswith(sig) for sig in signatures):
        return False
    # WEBP: bytes 0-3 = RIFF, bytes 8-11 = WEBP
    if ext == ".webp":
        return len(header) >= 12 and header[8:12] == b"WEBP"
    return True


async def validate_upload(
    file: UploadFile,
    allowed_extensions: list[str] | set[str],
    max_size_mb: int,
) -> tuple[bytes, str]:
    """
    Validate an uploaded file and return ``(raw_bytes, normalized_extension)``.

    Checks:
      1. Filename / extension is present and allowed
      2. Payload size does not exceed ``max_size_mb``
      3. Leading magic bytes match the declared extension (blocks renamed .exe → .pdf)

    Raises ``HTTPException`` (400) on any failure.
    """
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Файл не выбран",
        )

    allowed = {ext.lower() if ext.startswith(".") else f".{ext.lower()}" for ext in allowed_extensions}
    ext = Path(file.filename).suffix.lower()
    if ext not in allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Недопустимый формат файла. Разрешены: {', '.join(sorted(allowed))}",
        )

    if ext not in _MAGIC_BY_EXTENSION:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Проверка содержимого не поддерживается для расширения {ext}",
        )

    max_bytes = max_size_mb * 1024 * 1024
    contents = await file.read()
    # Rewind so callers that re-read still work
    await file.seek(0)

    if len(contents) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Пустой файл",
        )
    if len(contents) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Максимальный размер файла — {max_size_mb} МБ",
        )

    header = contents[:16]
    if not _matches_magic(ext, header):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Содержимое файла не соответствует расширению {ext}. "
                "Возможна подмена типа файла."
            ),
        )

    return contents, ext
