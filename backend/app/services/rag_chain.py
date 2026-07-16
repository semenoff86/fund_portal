"""RAG query pipeline: retrieve → LLM → citations."""

import re
from typing import Any

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from app.config import get_settings
from app.models import ChatMessage, ChatMessageRole
from app.services.rag_common import get_retriever

settings = get_settings()

SYSTEM_PROMPT = """Ты — внутренний AI-ассистент Фонда МКК. Отвечай СТРОГО на основе предоставленного контекста. Если ответа нет, скажи: «В документах Фонда нет информации по этому вопросу». В конце каждого утверждения из документа ставь маркер источника в формате [1], [2] и т.д. Не выдумывай факты. Отвечай на русском языке, кратко и по делу."""

CITATION_PATTERN = re.compile(r"\[(\d+)\]")


def _get_llm():
    """Prefer langchain-ollama; fall back to langchain_community ChatOllama."""
    try:
        from langchain_ollama import ChatOllama  # type: ignore
    except ImportError:
        from langchain_community.chat_models import ChatOllama  # type: ignore

    return ChatOllama(
        model=settings.ollama_model,
        base_url=settings.ollama_base_url,
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
    # If model forgot citations, still return retrieved docs as soft sources
    if not sources and source_map:
        sources = [
            {"id": v["id"], "file": v["file"], "snippet": v["snippet"]}
            for v in source_map.values()
        ]
    return sources


def run_rag_query(question: str, history: list[ChatMessage]) -> tuple[str, list[dict[str, Any]]]:
    """Execute RAG: similarity retrieve (k=4) → ChatOllama → parse citations."""
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
    response = llm.invoke(messages)
    answer = response.content if hasattr(response, "content") else str(response)
    sources = extract_cited_sources(answer, source_map)
    return answer, sources


def auto_session_title(first_message: str, max_len: int = 50) -> str:
    text = first_message.strip().replace("\n", " ")
    if len(text) <= max_len:
        return text or "Новый чат"
    return text[: max_len - 1] + "…"
