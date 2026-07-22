"""RAG-based AI chat with session history and citation sources."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.chat_schemas import (
    ChatMessageResponse,
    ChatSessionCreate,
    ChatSessionDetailResponse,
    ChatSessionResponse,
    FlatChatMessageRequest,
    FlatChatMessageResponse,
    SendMessageRequest,
    SendMessageResponse,
)
from app.database import get_db
from app.dependencies import get_current_user
from app.models import ChatMessage, ChatMessageRole, ChatSession, User
from app.services.audit import log_audit
from app.services.rag_chain import OllamaUnavailableError, auto_session_title, run_rag_query

router = APIRouter(prefix="/api/chat", tags=["chat"])

OLLAMA_UNAVAILABLE_PAYLOAD = {
    "answer": "AI-сервис временно недоступен.",
    "sources": [],
}


def _get_session_or_404(db: Session, session_id: int, user_id: int) -> ChatSession:
    session = (
        db.query(ChatSession)
        .filter(ChatSession.id == session_id, ChatSession.user_id == user_id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Сессия не найдена")
    return session


def _run_and_persist(
    *,
    db: Session,
    session: ChatSession,
    content: str,
    current_user: User,
    request: Request | None = None,
) -> SendMessageResponse:
    from app.config import get_settings

    settings = get_settings()
    is_first_message = (
        db.query(ChatMessage).filter(ChatMessage.session_id == session.id).count() == 0
    )

    user_msg = ChatMessage(
        session_id=session.id,
        role=ChatMessageRole.USER,
        content=content.strip(),
    )
    db.add(user_msg)
    db.flush()

    if session.title == "Новый чат" and is_first_message:
        session.title = auto_session_title(content)

    history = (
        db.query(ChatMessage)
        .filter(ChatMessage.session_id == session.id, ChatMessage.id != user_msg.id)
        .order_by(ChatMessage.created_at.desc())
        .limit(settings.chat_history_limit)
        .all()
    )
    history.reverse()

    try:
        answer, sources = run_rag_query(content, history)
    except OllamaUnavailableError as exc:
        import logging

        logging.getLogger(__name__).warning("Ollama unavailable: %s", exc)
        db.rollback()
        log_audit(
            db,
            action="AI_CHAT_QUERY",
            success=False,
            user=current_user,
            object_type="chat_session",
            object_id=session.id,
            request=request,
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=OLLAMA_UNAVAILABLE_PAYLOAD,
        ) from exc
    except Exception as exc:
        import logging

        logging.getLogger(__name__).exception("RAG pipeline failed: %s", exc)
        db.rollback()
        log_audit(
            db,
            action="AI_CHAT_QUERY",
            success=False,
            user=current_user,
            object_type="chat_session",
            object_id=session.id,
            request=request,
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=OLLAMA_UNAVAILABLE_PAYLOAD,
        ) from exc

    assistant_msg = ChatMessage(
        session_id=session.id,
        role=ChatMessageRole.ASSISTANT,
        content=answer,
        sources=sources,
    )
    db.add(assistant_msg)
    session.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user_msg)
    db.refresh(assistant_msg)

    log_audit(
        db,
        action="AI_CHAT_QUERY",
        success=True,
        user=current_user,
        object_type="chat_session",
        object_id=session.id,
        request=request,
    )

    return SendMessageResponse(
        answer=answer,
        sources=sources,
        user_message=ChatMessageResponse.model_validate(user_msg),
        assistant_message=ChatMessageResponse.model_validate(assistant_msg),
    )


@router.post("/sessions", response_model=ChatSessionResponse, status_code=status.HTTP_201_CREATED)
def create_session(
    payload: ChatSessionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = ChatSession(
        user_id=current_user.id,
        title=payload.title or "Новый чат",
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


@router.get("/sessions", response_model=list[ChatSessionResponse])
def list_sessions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(ChatSession)
        .filter(ChatSession.user_id == current_user.id)
        .order_by(ChatSession.updated_at.desc())
        .all()
    )


@router.get("/sessions/{session_id}", response_model=ChatSessionDetailResponse)
def get_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = _get_session_or_404(db, session_id, current_user.id)
    return ChatSessionDetailResponse(
        id=session.id,
        title=session.title,
        created_at=session.created_at,
        updated_at=session.updated_at,
        messages=[ChatMessageResponse.model_validate(m) for m in session.messages],
    )


@router.post("/sessions/{session_id}/message", response_model=SendMessageResponse)
def send_message(
    session_id: int,
    payload: SendMessageRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = _get_session_or_404(db, session_id, current_user.id)
    return _run_and_persist(
        db=db,
        session=session,
        content=payload.content,
        current_user=current_user,
        request=request,
    )


@router.post("/message", response_model=FlatChatMessageResponse)
def send_flat_message(
    payload: FlatChatMessageRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Convenience endpoint: ``{ session_id, message }`` → ``{ answer, sources }``.

    Creates a session automatically when ``session_id`` is omitted.
    """
    if payload.session_id is not None:
        session = _get_session_or_404(db, payload.session_id, current_user.id)
    else:
        session = ChatSession(user_id=current_user.id, title="Новый чат")
        db.add(session)
        db.commit()
        db.refresh(session)

    result = _run_and_persist(
        db=db,
        session=session,
        content=payload.message,
        current_user=current_user,
        request=request,
    )
    return FlatChatMessageResponse(
        answer=result.answer,
        sources=result.sources,
        session_id=session.id,
    )
