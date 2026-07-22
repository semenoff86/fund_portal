"""Shared RAG components: embeddings and PGVector store."""

import os
from functools import lru_cache

from langchain_community.embeddings import FastEmbedEmbeddings
from langchain_postgres import PGVector

from app.config import get_settings

settings = get_settings()


def _pg_connection_string() -> str:
    """langchain-postgres expects postgresql+psycopg:// driver."""
    url = settings.database_url
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+psycopg://", 1)
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+psycopg://", 1)
    return url


@lru_cache
def get_embeddings() -> FastEmbedEmbeddings:
    cache_dir = settings.fastembed_cache_dir
    try:
        os.makedirs(cache_dir, exist_ok=True)
        probe = os.path.join(cache_dir, ".write_test")
        with open(probe, "w", encoding="utf-8") as fh:
            fh.write("ok")
        os.remove(probe)
    except OSError:
        # Named volume may be root-owned; fall back to a writable temp dir.
        cache_dir = "/tmp/fastembed"
        os.makedirs(cache_dir, exist_ok=True)
    return FastEmbedEmbeddings(
        model_name=settings.embedding_model,
        cache_dir=cache_dir,
    )


@lru_cache
def get_vector_store() -> PGVector:
    return PGVector(
        embeddings=get_embeddings(),
        collection_name=settings.pgvector_collection,
        connection=_pg_connection_string(),
        use_jsonb=True,
    )


def get_retriever():
    return get_vector_store().as_retriever(
        search_type="similarity",
        search_kwargs={"k": settings.rag_retriever_k},
    )
