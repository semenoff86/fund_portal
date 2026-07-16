# RAG Setup — Ubuntu + Ollama + FastEmbed

Краткое руководство по локальному AI-ассистенту портала МКК.

## Архитектура

| Компонент | Технология |
|-----------|------------|
| LLM | Ollama (`qwen2.5:7b` или локальный GGUF) |
| Embeddings | FastEmbed `BAAI/bge-m3` (CPU, без PyTorch) |
| Vector Store | PGVector через `langchain-postgres` |
| Документы | PDF (PyMuPDF), DOCX (python-docx) |
| Chunking | `RecursiveCharacterTextSplitter` (800 / 100) |

## 1. Установка Ollama на Ubuntu

```bash
curl -fsSL https://ollama.com/install.sh | sh
sudo systemctl enable --now ollama
```

### Импорт модели из реестра

```bash
ollama pull qwen2.5:7b
# или более точная instruct-версия:
ollama pull qwen2.5:7b-instruct-q4_K_M
```

Проверка:

```bash
ollama run qwen2.5:7b "Привет, кто ты?"
```

### Импорт локального GGUF (например Bonsai 27B)

```bash
# Создайте Modelfile
cat > Modelfile <<'EOF'
FROM ./bonsai-27b-q4_k_m.gguf
PARAMETER temperature 0.1
PARAMETER num_ctx 4096
EOF

ollama create bonsai-27b -f Modelfile
```

В `backend/.env` или `docker-compose.yml`:

```env
OLLAMA_BASE_URL=http://host.docker.internal:11434
OLLAMA_MODEL=qwen2.5:7b
# или OLLAMA_MODEL=bonsai-27b
```

> В Docker backend обращается к Ollama на хосте через `host.docker.internal`.
> Если Ollama на той же машине без Docker: `http://localhost:11434`.

## 2. Расширения PostgreSQL

При старте API / миграциях выполняются автоматически:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

Вручную (если нужно):

```bash
docker compose exec db psql -U postgres -d fund_portal \
  -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;"
```

## 3. Индексация документов (ingestion)

### A. Через админ-панель

Загрузите PDF/DOCX в **Администрирование → База знаний**.  
При загрузке автоматически:

1. Версионирование (`handle_document_versioning`)
2. Извлечение текста
3. Чанкинг + FastEmbed → PGVector (`ingest_document`)

### B. CLI (папка целиком)

Положите файлы в `backend/uploads/knowledge/` (или смонтированный volume):

```bash
# Внутри контейнера backend
docker compose exec backend python scripts/ingest_rag_documents.py

# Или локально из backend/
cd backend
source .venv/bin/activate
python scripts/ingest_rag_documents.py
python scripts/ingest_rag_documents.py --dir uploads/knowledge --no-reset
```

`--no-reset` — добавить чанки без очистки коллекции `mkk_documents`.

### C. Программный вызов

```python
from app.services.rag_ingestion import ingest_document, handle_document_versioning

version = handle_document_versioning(db, filename="ustav.pdf", category="GENERAL", title="Устав")
ingest_document(
    "uploads/knowledge/ustav.pdf",
    category="GENERAL",
    uploaded_by=1,
    version=version,
    source_file="ustav.pdf",
    document_id=42,
)
```

## 4. Проверка чата

1. Откройте `http://<host>:3000/dashboard/ai-chat`
2. Задайте вопрос по загруженным документам
3. Ответ должен содержать маркеры `[1]`, `[2]` и блок «Источники»
4. Инференс на CPU обычно занимает **5–15 секунд**

API:

- `POST /api/chat/sessions/{id}/message` — основной UI-эндпоинт
- `POST /api/chat/message` — `{ "session_id": 1, "message": "..." }` → `{ "answer", "sources" }`

## 5. Hybrid search базы знаний

`GET /api/orders?search=...` комбинирует:

1. Семантический поиск по PGVector
2. Fuzzy `pg_trgm` (`%%` / `similarity`) по title/content_text

Параметры версий:

- `is_active=true` (по умолчанию) — только актуальные
- `include_inactive=true` — все версии, включая архив

## 6. Troubleshooting

| Симптом | Решение |
|---------|---------|
| `AI-сервис недоступен` | `systemctl status ollama`, проверьте `OLLAMA_BASE_URL` |
| Пустые ответы / нет источников | Запустите ingestion, проверьте `uploads/knowledge` |
| Медленно | Нормально на CPU; уменьшите `num_ctx` или возьмите меньшую модель |
| `pg_trgm` errors | `CREATE EXTENSION IF NOT EXISTS pg_trgm;` |
| Embeddings качаются при первом запуске | FastEmbed кэширует в `FASTEMBED_CACHE_DIR` (volume в Docker) |

См. также: [AI_SETUP.md](AI_SETUP.md) (Windows / llama.cpp fallback).
