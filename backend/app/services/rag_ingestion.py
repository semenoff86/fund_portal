"""Document ingestion pipeline for RAG (DOCX/PDF → PGVector)."""

import logging
from pathlib import Path

from docx import Document as DocxDocument
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.config import get_settings
from app.services import rag_common
from app.services.rag_common import get_vector_store

logger = logging.getLogger(__name__)
settings = get_settings()

ALLOWED_EXTENSIONS = {".pdf", ".docx"}


def _guess_category(filename: str, parent_dir: str) -> str:
    name_lower = filename.lower()
    parent_lower = Path(parent_dir).name.lower()
    if parent_lower not in ("knowledge", "uploads", "documents", ""):
        return parent_lower.upper()
    if "устав" in name_lower:
        return "GENERAL"
    if "безопас" in name_lower or "охран" in name_lower:
        return "SAFETY"
    if "кредит" in name_lower or "займ" in name_lower:
        return "CREDIT"
    if "приказ" in name_lower or "hr" in name_lower or "кадр" in name_lower:
        return "HR"
    return "GENERAL"


def _load_pdf_text(path: Path) -> str:
    import fitz  # PyMuPDF

    text_parts: list[str] = []
    with fitz.open(path) as pdf:
        for page in pdf:
            text_parts.append(page.get_text())
    return "\n".join(text_parts).strip()


def _load_docx_text(path: Path) -> str:
    doc = DocxDocument(str(path))
    return "\n".join(p.text for p in doc.paragraphs if p.text.strip()).strip()


def load_file_as_document(path: Path) -> Document | None:
    ext = path.suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        return None
    try:
        if ext == ".pdf":
            text = _load_pdf_text(path)
        else:
            text = _load_docx_text(path)
    except Exception as exc:
        logger.warning("Failed to load %s: %s", path, exc)
        return None
    if not text:
        return None
    return Document(
        page_content=text,
        metadata={
            "source_file": path.name,
            "category": _guess_category(path.name, str(path.parent)),
            "file_path": str(path),
        },
    )


def load_documents_from_directory(directory: Path | None = None) -> list[Document]:
    root = directory or Path(settings.rag_documents_dir)
    if not root.exists():
        logger.warning("RAG documents directory not found: %s", root)
        return []
    docs: list[Document] = []
    for path in sorted(root.rglob("*")):
        if path.is_file() and path.suffix.lower() in ALLOWED_EXTENSIONS:
            doc = load_file_as_document(path)
            if doc:
                docs.append(doc)
    return docs


def split_documents(documents: list[Document]) -> list[Document]:
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=settings.rag_chunk_size,
        chunk_overlap=settings.rag_chunk_overlap,
    )
    chunks = splitter.split_documents(documents)
    for idx, chunk in enumerate(chunks):
        source = chunk.metadata.get("source_file", "unknown")
        chunk.metadata["chunk_index"] = idx
        chunk.metadata["source_file"] = source
    return chunks


def ingest_directory(directory: Path | None = None, *, reset: bool = True) -> dict:
    """
    Load, chunk, embed and upsert documents into PGVector.
    If reset=True, clears the collection before re-ingestion.
    """
    raw_docs = load_documents_from_directory(directory)
    if not raw_docs:
        return {"files": 0, "chunks": 0, "message": "No documents found"}

    chunks = split_documents(raw_docs)
    store = get_vector_store()

    if reset:
        try:
            store.delete_collection()
        except Exception as exc:
            logger.warning("Could not reset collection: %s", exc)
        rag_common.get_vector_store.cache_clear()
        store = get_vector_store()

    store.add_documents(chunks)
    return {
        "files": len(raw_docs),
        "chunks": len(chunks),
        "message": f"Ingested {len(chunks)} chunks from {len(raw_docs)} files",
    }
