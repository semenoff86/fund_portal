"""RAG query pipeline: retrieve → LLM → citations."""

import logging
import re
from typing import Any

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from app.config import get_settings
from app.models import ChatMessage, ChatMessageRole
from app.services.rag_common import get_retriever

logger = logging.getLogger(__name__)
settings = get_settings()

SYSTEM_PROMPT = (
    "Ты — внутренний AI-ассистент Фонда МКК. Отвечай СТРОГО на основе "
    "предоставленного контекста. Если ответа нет, скажи: "
    "'В документах Фонда нет информации по этому вопросу'. "
    "В конце каждого утверждения ставь маркер источника [1], [2] и т.д."
)

CITATION_PATTERN = re.compile(r"\[(\d+)\]")


class OllamaUnavailableError(RuntimeError):
    """Raised when the Ollama HTTP endpoint cannot be reached."""


def _is_ollama_connection_error(exc: BaseException) -> bool:
    text = f"{type(exc).__name__}: {exc}".lower()
    needles = (
        "connection refused",
        "connect error",
        "connecttimeout",
        "timed out",
        "name or service not known",
        "failed to establish",
        "nodename nor servname",
        "httpx.",
        "httpcore.",
        "ollama",
        "11434",
    )
    return any(n in text for n in needles)


def ensure_ollama_reachable() -> None:
    """Lightweight preflight against Ollama /api/tags."""
    import urllib.error
    import urllib.request

    base = settings.ollama_base_url.rstrip("/")
    url = f"{base}/api/tags"
    try:
        with urllib.request.urlopen(url, timeout=5) as resp:
            if getattr(resp, "status", 200) >= 500:
                raise OllamaUnavailableError(f"Ollama returned HTTP {resp.status}")
    except OllamaUnavailableError:
        raise
    except Exception as exc:
        raise OllamaUnavailableError(f"Ollama unreachable at {base}: {exc}") from exc


def _get_llm():
    """ChatOllama with model/base_url from env (OLLAMA_MODEL / OLLAMA_BASE_URL)."""
    try:
        from langchain_ollama import ChatOllama  # type: ignore
    except ImportError:
        from langchain_community.chat_models import ChatOllama  # type: ignore

    return ChatOllama(
        model=settings.ollama_model or "qwen2.5:7b-instruct-q4_K_M",
        base_url=settings.ollama_base_url or "http://localhost:11434",
        temperature=0.1,
        num_ctx=4096,
    )


def _build_source_map(docs: list) -> dict[int, dict[str, Any]]:
    source_map: dict[int, dict[str, Any]] = {}
    for i, doc in enumerate(docs, start=1):
        snippet = doc.page_content[:300].replace("\n", " ")
        meta = doc.metadata or {}
        source_map[i] = {
            "id": i,
            "file": meta.get("source_file", "unknown"),
            "snippet": snippet,
            "chunk_index": meta.get("chunk_index"),
            "version": meta.get("version"),
            "category": meta.get("category"),
        }
    return source_map


def _build_context(docs: list) -> str:
    parts = []
    for i, doc in enumerate(docs, start=1):
        parts.append(f"[{i}] (файл: {doc.metadata.get('source_file', '?')})\n{doc.page_content}")
    return "\n\n---\n\n".join(parts)


def extract_cited_sources(answer: str, source_map: dict[int, dict[str, Any]]) -> list[dict[str, Any]]:
    """Map [1], [2], … markers in the answer to retrieved chunk metadata."""
    cited_ids = sorted({int(m.group(1)) for m in CITATION_PATTERN.finditer(answer)})
    sources: list[dict[str, Any]] = []
    for i in cited_ids:
        if i not in source_map:
            continue
        src = source_map[i]
        sources.append(
            {
                "id": src["id"],
                "file": src["file"],
                "snippet": src["snippet"],
            }
        )
    if not sources and source_map:
        sources = [
            {"id": v["id"], "file": v["file"], "snippet": v["snippet"]}
            for v in source_map.values()
        ]
    return sources


def run_rag_query(question: str, history: list[ChatMessage]) -> tuple[str, list[dict[str, Any]]]:
    """Execute RAG: similarity retrieve (k=4) → ChatOllama → parse citations."""
    ensure_ollama_reachable()

    retriever = get_retriever()
    docs = retriever.invoke(question)
    source_map = _build_source_map(docs)
    context = _build_context(docs)

    messages: list = [
        SystemMessage(content=f"{SYSTEM_PROMPT}\n\nКонтекст из документов:\n{context}"),
    ]
    for msg in history:
        if msg.role == ChatMessageRole.USER:
            messages.append(HumanMessage(content=msg.content))
        else:
            messages.append(AIMessage(content=msg.content))
    messages.append(HumanMessage(content=question))

    llm = _get_llm()
    try:
        response = llm.invoke(messages)
    except Exception as exc:
        if _is_ollama_connection_error(exc):
            raise OllamaUnavailableError(str(exc)) from exc
        raise

    answer = response.content if hasattr(response, "content") else str(response)
    sources = extract_cited_sources(answer, source_map)
    return answer, sources


def auto_session_title(first_message: str, max_len: int = 50) -> str:
    text = first_message.strip().replace("\n", " ")
    if len(text) <= max_len:
        return text or "Новый чат"
    return text[: max_len - 1] + "…"
