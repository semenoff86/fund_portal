"""Application configuration loaded from environment variables."""

from functools import lru_cache
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    database_url: str = "postgresql://postgres:postgres@localhost:5432/fund_portal"
    secret_key: str = "dev-secret-key-change-in-production"
    algorithm: str = "HS256"
    # Short-lived access JWT; clients renew via POST /api/auth/refresh
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7
    cors_origins: str = "http://localhost:3000"

    # RAG / AI
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "qwen2.5:7b-instruct-q4_K_M"
    embedding_model: str = "BAAI/bge-m3"
    rag_documents_dir: str = "uploads/knowledge"
    fastembed_cache_dir: str = "cache/fastembed"
    pgvector_collection: str = "mkk_documents"
    rag_chunk_size: int = 800
    rag_chunk_overlap: int = 100
    rag_retriever_k: int = 4
    chat_history_limit: int = 10

    # Audit log retention (0 = never purge)
    audit_retention_months: int = 12

    @property
    def cors_origin_list(self) -> List[str]:
        origins = [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]
        # Dev: Next.js may use 3001+ if 3000 is busy
        for port in range(3000, 3010):
            dev_origin = f"http://localhost:{port}"
            if dev_origin not in origins:
                origins.append(dev_origin)
        return origins


@lru_cache
def get_settings() -> Settings:
    return Settings()
