# AI-ассистент (RAG) — настройка

## Архитектура

| Компонент | Технология |
|-----------|------------|
| LLM | Ollama → `qwen2.5:7b-instruct-q4_K_M` |
| Embeddings | FastEmbed `BAAI/bge-m3` (CPU) |
| Vector Store | PGVector (PostgreSQL) |
| Документы | PDF (PyMuPDF), DOCX (python-docx) |

## 1. Установка Ollama (Windows Server / локально)

1. Скачайте [Ollama](https://ollama.com/download) (на Win Server 2012 может не работать — см. fallback ниже).
2. Запустите Ollama и загрузите модель:

```powershell
ollama pull qwen2.5:7b-instruct-q4_K_M
```

Альтернатива:
```powershell
ollama pull llama3:8b-instruct-q4_K_M
```

3. Проверка:
```powershell
ollama run qwen2.5:7b-instruct-q4_K_M "Привет"
```

### Fallback: llama.cpp server

Если Ollama недоступен на Win Server 2012:

```powershell
# Запустите llama.cpp server на порту 8080
# Укажите в backend/.env:
OLLAMA_BASE_URL=http://localhost:8080
OLLAMA_MODEL=ваша-модель
```

LangChain `ChatOllama` совместим с OpenAI-совместимым API Ollama/llama.cpp.

## 2. Backend — зависимости

```powershell
cd backend
.\.venv\Scripts\activate
pip install -r requirements.txt
```

Переменные окружения (`backend/.env`):

```env
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:7b-instruct-q4_K_M
EMBEDDING_MODEL=BAAI/bge-m3
RAG_DOCUMENTS_DIR=uploads/knowledge
FASTEMBED_CACHE_DIR=cache/fastembed
PGVECTOR_COLLECTION=mkk_documents
```

### Docker

Backend в Docker обращается к Ollama на хосте:

```yaml
# docker-compose.yml (уже добавлено)
OLLAMA_BASE_URL: http://host.docker.internal:11434
```

## 3. Индексация документов

Положите DOCX/PDF в `backend/uploads/knowledge/` (или загрузите через админ-панель «База знаний»).

Запуск индексации:

```powershell
cd backend
python scripts/ingest_rag_documents.py
```

Опции:
```powershell
python scripts/ingest_rag_documents.py --dir uploads/knowledge
python scripts/ingest_rag_documents.py --no-reset   # добавить без очистки
```

При первом запуске FastEmbed скачает `BAAI/bge-m3` в `cache/fastembed/`.

## 4. Проверка

1. Backend: `http://localhost:8000/docs` → `/api/chat/sessions`
2. Портал: `/dashboard/ai-chat`
3. Задайте вопрос по загруженному документу — ответ с маркерами `[1]`, `[2]` и блоком «Источники»

## 5. Производительность (CPU, 64 GB RAM)

- ~10 одновременных пользователей
- Ответ 10–15 сек — нормально
- Frontend timeout: 90 сек
- `temperature=0.1`, `num_ctx=4096`, `k=4` чанков

## 6. Устранение неполадок

| Проблема | Решение |
|----------|---------|
| 503 AI-сервис недоступен | Запустите Ollama, проверьте `OLLAMA_BASE_URL` |
| Нет ответа по документам | Запустите `ingest_rag_documents.py` |
| Пустой контекст | Проверьте файлы в `uploads/knowledge/` |
| Docker не видит Ollama | `host.docker.internal:11434` + Ollama на хосте |
