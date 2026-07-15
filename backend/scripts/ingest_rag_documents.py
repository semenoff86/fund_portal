"""CLI: ingest DOCX/PDF documents into PGVector for RAG.

Usage (from backend/):
    python scripts/ingest_rag_documents.py
    python scripts/ingest_rag_documents.py --dir ../uploads/knowledge --no-reset
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import init_db
from app.services.rag_ingestion import ingest_directory


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest documents into PGVector")
    parser.add_argument("--dir", type=str, default=None, help="Documents directory")
    parser.add_argument("--no-reset", action="store_true", help="Append without clearing collection")
    args = parser.parse_args()

    init_db()
    directory = Path(args.dir) if args.dir else None
    result = ingest_directory(directory, reset=not args.no_reset)
    print(result["message"])
    print(f"  Files:  {result['files']}")
    print(f"  Chunks: {result['chunks']}")


if __name__ == "__main__":
    main()
