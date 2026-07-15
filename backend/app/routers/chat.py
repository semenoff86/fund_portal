"""RAG-based AI chat with session history."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.chat_schemas import (
    ChatMessageResponse,
    ChatSessionCreate,
    ChatSessionDetailResponse,
    ChatSessionResponse,
    SendMessageRequest,
    SendMessageResponse,
)
from app.database import get_db
from app.dependencies import get_current_user
from app.models import ChatMessage, ChatMessageRole, ChatSession, User
from app.services.rag_chain import auto_session_title, run_rag_query

router = APIRouter(prefix="/api/chat", tags=["chat"])


def _get_session_or_404(db: Session, session_id: int, user_id: int) -> ChatSession:
    session = (
        db.query(ChatSession)
        .filter(ChatSession.id == session_id, ChatSession.user_id == user_id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Сессия не найдена")
    return session


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
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.config import get_settings

    settings = get_settings()
    session = _get_session_or_404(db, session_id, current_user.id)

    is_first_message = (
        db.query(ChatMessage).filter(ChatMessage.session_id == session.id).count() == 0
    )

    user_msg = ChatMessage(
        session_id=session.id,
        role=ChatMessageRole.USER,
        content=payload.content.strip(),
    )
    db.add(user_msg)
    db.flush()

    if session.title == "Новый чат" and is_first_message:
        session.title = auto_session_title(payload.content)

    history = (
        db.query(ChatMessage)
        .filter(ChatMessage.session_id == session.id, ChatMessage.id != user_msg.id)
        .order_by(ChatMessage.created_at.desc())
        .limit(settings.chat_history_limit)
        .all()
    )
    history.reverse()

    try:
        answer, sources = run_rag_query(payload.content, history)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"AI-сервис недоступен. Убедитесь, что Ollama запущена: {exc}",
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

    return SendMessageResponse(
        answer=answer,
        sources=sources,
        user_message=ChatMessageResponse.model_validate(user_msg),
        assistant_message=ChatMessageResponse.model_validate(assistant_msg),
    )
