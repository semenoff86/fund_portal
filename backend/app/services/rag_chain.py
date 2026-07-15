"""RAG query pipeline: retrieve → LLM → citations."""

import re
from typing import Any

from langchain_community.chat_models import ChatOllama
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from app.config import get_settings
from app.models import ChatMessage, ChatMessageRole
from app.services.rag_common import get_retriever

settings = get_settings()

SYSTEM_PROMPT = """Ты — внутренний AI-ассистент Фонда МКК.
Отвечай строго на основе предоставленного контекста из документов Фонда.
Если ответа нет в контексте, честно скажи: «В предоставленных документах нет информации по этому вопросу».
В конце каждого утверждения, взятого из документа, ставь маркер источника в формате [1], [2] и т.д.
Не выдумывай факты. Отвечай на русском языке, кратко и по делу."""

CITATION_PATTERN = re.compile(r"\[(\d+)\]")


def _get_llm() -> ChatOllama:
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
        source_map[i] = {
            "id": i,
            "file": doc.metadata.get("source_file", "unknown"),
            "snippet": snippet,
        }
    return source_map


def _build_context(docs: list) -> str:
    parts = []
    for i, doc in enumerate(docs, start=1):
        parts.append(f"[{i}] (файл: {doc.metadata.get('source_file', '?')})\n{doc.page_content}")
    return "\n\n---\n\n".join(parts)


def extract_cited_sources(answer: str, source_map: dict[int, dict[str, Any]]) -> list[dict[str, Any]]:
    cited_ids = sorted({int(m.group(1)) for m in CITATION_PATTERN.finditer(answer)})
    return [source_map[i] for i in cited_ids if i in source_map]


def run_rag_query(question: str, history: list[ChatMessage]) -> tuple[str, list[dict[str, Any]]]:
    """Execute RAG: retrieve docs, call LLM with history, return answer + sources."""
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
