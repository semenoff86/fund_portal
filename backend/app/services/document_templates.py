"""Load document template metadata and generate filled .docx files."""

from __future__ import annotations

import json
import os
import uuid
from datetime import date, datetime
from pathlib import Path
from typing import Any

from docxtpl import DocxTemplate
from fastapi import HTTPException, status

from app.models import User

PROJECT_ROOT = Path(__file__).resolve().parents[3]
TEMPLATES_ROOT = Path(os.getenv("TEMPLATES_DIR", str(PROJECT_ROOT / "templates" / "documents")))
METADATA_DIR = TEMPLATES_ROOT / "metadata"
GENERATED_DIR = TEMPLATES_ROOT / "generated"

ROLE_LABELS = {
    "admin": "Администратор",
    "analyst": "Аналитик",
    "hr": "Специалист HR",
    "accountant": "Бухгалтер",
    "legal": "Юрист",
}


def _format_date_ru(value: date | datetime | str | None) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        try:
            value = date.fromisoformat(value[:10])
        except ValueError:
            return value
    if isinstance(value, datetime):
        value = value.date()
    months = [
        "января", "февраля", "марта", "апреля", "мая", "июня",
        "июля", "августа", "сентября", "октября", "ноября", "декабря",
    ]
    return f'«{value.day}» {months[value.month - 1]} {value.year} г.'


def resolve_auto_value(source: str, user: User) -> str:
    today = date.today()
    if source == "auto.today":
        return _format_date_ru(today)
    if source == "auto.year":
        return str(today.year)

    if source.startswith("profile."):
        attr = source.split(".", 1)[1]
        value = getattr(user, attr, None)
        if attr == "role" and value is not None:
            role_key = value.value if hasattr(value, "value") else str(value)
            return ROLE_LABELS.get(role_key, role_key)
        return str(value) if value is not None else ""

    return ""


def load_all_templates() -> list[dict[str, Any]]:
    templates: list[dict[str, Any]] = []
    if not METADATA_DIR.exists():
        return templates

    for path in sorted(METADATA_DIR.glob("*.json")):
        if path.name.startswith("_"):
            continue
        with path.open(encoding="utf-8") as f:
            data = json.load(f)
        data["has_source_file"] = (TEMPLATES_ROOT / data["source_file"]).exists()
        templates.append(data)
    return templates


def load_template(slug: str) -> dict[str, Any]:
    path = METADATA_DIR / f"{slug}.json"
    if not path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Шаблон не найден")
    with path.open(encoding="utf-8") as f:
        data = json.load(f)
    data["has_source_file"] = (TEMPLATES_ROOT / data["source_file"]).exists()
    return data


def build_prefill(template: dict[str, Any], user: User) -> dict[str, str]:
    prefill: dict[str, str] = {}
    for field in template.get("fields", []):
        source = field.get("source")
        if source:
            prefill[field["key"]] = resolve_auto_value(source, user)
    return prefill


def enrich_template_for_user(template: dict[str, Any], user: User) -> dict[str, Any]:
    fields = []
    prefill = build_prefill(template, user)
    for field in template.get("fields", []):
        enriched = {**field}
        if field.get("readonly") and field["key"] in prefill:
            enriched["value"] = prefill[field["key"]]
        fields.append(enriched)
    return {
        "slug": template["slug"],
        "title": template["title"],
        "description": template.get("description", ""),
        "category": template.get("category", "HR"),
        "has_source_file": template.get("has_source_file", False),
        "fields": fields,
        "prefill": prefill,
    }


def _validate_required_fields(template: dict[str, Any], values: dict[str, Any]) -> None:
    missing = []
    for field in template.get("fields", []):
        if not field.get("required"):
            continue
        val = values.get(field["key"])
        if val is None or (isinstance(val, str) and not val.strip()):
            missing.append(field["label"])
    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Заполните обязательные поля: {', '.join(missing)}",
        )


def _merge_context(template: dict[str, Any], user: User, values: dict[str, Any]) -> dict[str, str]:
    context: dict[str, str] = {}
    prefill = build_prefill(template, user)
    for field in template.get("fields", []):
        key = field["key"]
        raw = values.get(key, prefill.get(key, ""))
        if field.get("type") == "date" and raw and not field.get("source", "").startswith("auto."):
            context[key] = _format_date_ru(str(raw))
        else:
            context[key] = str(raw) if raw is not None else ""
    return context


def generate_document(slug: str, user: User, values: dict[str, Any]) -> Path:
    template = load_template(slug)
    source_path = TEMPLATES_ROOT / template["source_file"]

    if not source_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Файл шаблона не найден. Загрузите .docx в templates/documents/source/",
        )

    _validate_required_fields(template, values)
    context = _merge_context(template, user, values)

    GENERATED_DIR.mkdir(parents=True, exist_ok=True)
    output_name = f"{slug}_{user.id}_{uuid.uuid4().hex[:8]}.docx"
    output_path = GENERATED_DIR / output_name

    doc = DocxTemplate(str(source_path))
    doc.render(context)
    doc.save(str(output_path))
    return output_path


def ensure_sample_templates() -> None:
    """Create demo .docx files if missing."""
    source_dir = TEMPLATES_ROOT / "source"
    if source_dir.exists() and any(source_dir.glob("*.docx")):
        return
    import importlib.util

    backend_root = Path(__file__).resolve().parents[2]
    script_path = backend_root / "scripts" / "create_sample_docx.py"
    if not script_path.exists():
        script_path = PROJECT_ROOT / "backend" / "scripts" / "create_sample_docx.py"
    if not script_path.exists():
        return
    spec = importlib.util.spec_from_file_location("create_sample_docx", script_path)
    if spec and spec.loader:
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        module.main()
