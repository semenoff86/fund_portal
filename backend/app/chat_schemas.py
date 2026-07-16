"""Pydantic schemas for RAG chat API."""

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.models import ChatMessageRole


class ChatSource(BaseModel):
    id: int
    file: str
    snippet: str


class ChatSessionCreate(BaseModel):
    title: Optional[str] = None


class ChatSessionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    created_at: datetime
    updated_at: datetime


class ChatMessageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    role: ChatMessageRole
    content: str
    sources: Optional[List[ChatSource]] = None
    created_at: datetime


class ChatSessionDetailResponse(ChatSessionResponse):
    messages: List[ChatMessageResponse] = []


class SendMessageRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=4000)


class SendMessageResponse(BaseModel):
    answer: str
    sources: List[ChatSource] = []
    user_message: ChatMessageResponse
    assistant_message: ChatMessageResponse


class FlatChatMessageRequest(BaseModel):
    """POST /api/chat/message payload."""

    message: str = Field(..., min_length=1, max_length=4000)
    session_id: Optional[int] = None


class FlatChatMessageResponse(BaseModel):
    answer: str
    sources: List[ChatSource] = []
    session_id: int
