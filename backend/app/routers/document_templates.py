"""Document template endpoints for Service Desk."""

from typing import Any

from fastapi import APIRouter, Depends
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.dependencies import get_current_user
from app.models import User
from app.services.document_templates import (
    enrich_template_for_user,
    generate_document,
    load_all_templates,
    load_template,
)

router = APIRouter(prefix="/api/document-templates", tags=["document-templates"])


class TemplateListItem(BaseModel):
    slug: str
    title: str
    description: str
    category: str
    has_source_file: bool


class TemplateField(BaseModel):
    key: str
    label: str
    type: str = "text"
    source: str | None = None
    readonly: bool = False
    required: bool = False
    placeholder: str | None = None
    value: str | None = None


class TemplateDetailResponse(BaseModel):
    slug: str
    title: str
    description: str
    category: str
    has_source_file: bool
    fields: list[TemplateField]
    prefill: dict[str, str]


class GenerateDocumentRequest(BaseModel):
    values: dict[str, Any] = Field(default_factory=dict)


@router.get("", response_model=list[TemplateListItem])
def list_templates(_current_user: User = Depends(get_current_user)):
    return [
        TemplateListItem(
            slug=t["slug"],
            title=t["title"],
            description=t.get("description", ""),
            category=t.get("category", "HR"),
            has_source_file=t.get("has_source_file", False),
        )
        for t in load_all_templates()
    ]


@router.get("/{slug}", response_model=TemplateDetailResponse)
def get_template(slug: str, current_user: User = Depends(get_current_user)):
    template = load_template(slug)
    enriched = enrich_template_for_user(template, current_user)
    return TemplateDetailResponse(**enriched)


@router.post("/{slug}/generate")
def generate_template_document(
    slug: str,
    payload: GenerateDocumentRequest,
    current_user: User = Depends(get_current_user),
):
    output_path = generate_document(slug, current_user, payload.values)
    template = load_template(slug)
    filename = f"{template['title']}.docx"
    return FileResponse(
        path=str(output_path),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=filename,
    )
