# Развёртывание на Windows Server 2012 (HP, CPU, 64 GB RAM)

## Какой вариант выбрать

| Вариант | Подходит для Win Server 2012? | Рекомендация |
|---------|-------------------------------|--------------|
| Docker Compose (3 контейнера) | Часто **нет** — нужны современные Linux-контейнеры | Не использовать |
| Один Docker-образ «всё в одном» | **Нет** — LLM и БД всё равно отдельно | Не использовать |
| **Нативная установка на Windows** | **Да** | **Рекомендуется** |
| БД в Linux VM (Hyper-V), остальное на Windows | **Да** | Если pgvector не ставится на Windows |

### Рекомендуемая схема для вашего железа

```
┌─────────────────────────────────────────────────────────────┐
│  Windows Server 2012 (HP, 64 GB RAM, CPU)                   │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ PostgreSQL   │  │ Backend      │  │ Frontend         │  │
│  │ + pgvector   │  │ FastAPI      │  │ Next.js :3000    │  │
│  │ :5432        │  │ :8000        │  │                  │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ llama.cpp server (Qwen 7B Q4)  :8080                 │  │
│  │ CPU-инференс, ~10 пользователей, ответ 10–15 сек     │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

**Почему не Docker:** на Windows Server 2012 современные образы (`python:3.12`, `node:20`, `pgvector`) обычно не запускаются.

**Почему не Ollama:** официальный Ollama плохо поддерживает Windows Server 2012. Используйте **llama.cpp server** (совместим с API, который ожидает backend).

**Почему нативно:** проще обслуживать, меньше накладных расходов, полный контроль над 64 GB RAM для LLM.

---

## Что понадобится

| Компонент | Версия | Назначение |
|-----------|--------|------------|
| PostgreSQL | 15–16 | БД портала + векторный поиск (pgvector) |
| Python | 3.11.x | Backend API + RAG |
| Node.js | **18 LTS** (не 20+) | Frontend (лучше совместимость с Win2012) |
| llama.cpp | последний release | Локальная LLM на CPU |
| Модель GGUF | `Qwen2.5-7B-Instruct-Q4_K_M` | ~5 GB на диске |

Скопируйте папку проекта на сервер, например: `C:\mkk\fund_portal\`

---

## Шаг 1. PostgreSQL + pgvector

### Вариант A (проще): БД в Hyper-V Linux VM

Если на сервере есть Hyper-V:

1. Создайте VM Ubuntu 22.04 (2 CPU, 4 GB RAM, 50 GB диск).
2. В VM установите Docker и запустите только БД:

```bash
docker run -d --name fund_portal_db \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=ВАШ_НАДЁЖНЫЙ_ПАРОЛЬ \
  -e POSTGRES_DB=fund_portal \
  -p 5432:5432 \
  -v fund_pgdata:/var/lib/postgresql/data \
  --restart unless-stopped \
  pgvector/pgvector:pg16
```

3. В `backend\.env` на Windows укажите IP VM:

```env
DATABASE_URL=postgresql://postgres:ВАШ_НАДЁЖНЫЙ_ПАРОЛЬ@192.168.x.x:5432/fund_portal
```

4. Откройте порт 5432 в firewall VM только для IP сервера Windows.

### Вариант B: PostgreSQL на Windows

1. Скачайте [PostgreSQL 15 для Windows](https://www.enterprisedb.com/downloads/postgres-postgresql-downloads).
2. Установите с паролем суперпользователя `postgres`.
3. Создайте БД:

```sql
CREATE DATABASE fund_portal;
\c fund_portal
CREATE EXTENSION IF NOT EXISTS vector;
```

4. Если `CREATE EXTENSION vector` не работает — используйте **Вариант A** (VM с pgvector).

`backend\.env`:

```env
DATABASE_URL=postgresql://postgres:ВАШ_ПАРОЛЬ@localhost:5432/fund_portal
```

---

## Шаг 2. Python и Backend

```powershell
cd C:\mkk\fund_portal\backend

# Python 3.11 с python.org (отметьте "Add to PATH")
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
```

Создайте `backend\.env` (на основе `.env.example`):

```env
DATABASE_URL=postgresql://postgres:ПАРОЛЬ@localhost:5432/fund_portal
SECRET_KEY=сгенерируйте-длинную-случайную-строку-минимум-32-символа
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=480
CORS_ORIGINS=http://localhost:3000,http://IP_СЕРВЕРА:3000

# RAG / AI
OLLAMA_BASE_URL=http://127.0.0.1:8080
OLLAMA_MODEL=qwen2.5-7b-instruct-q4_K_M
EMBEDDING_MODEL=BAAI/bge-m3
RAG_DOCUMENTS_DIR=uploads/knowledge
FASTEMBED_CACHE_DIR=cache/fastembed
PGVECTOR_COLLECTION=mkk_documents
```

Инициализация БД и демо-данные:

```powershell
python seed.py
```

Проверка API:

```powershell
.\.venv\Scripts\uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Откройте в браузере: `http://localhost:8000/docs`

---

## Шаг 3. llama.cpp (локальная LLM на CPU)

### 3.1 Скачать llama.cpp

1. Перейдите на [релизы llama.cpp](https://github.com/ggerganov/llama.cpp/releases).
2. Скачайте архив для Windows (например `llama-bXXXX-bin-win-avx2-x64.zip`).
3. Распакуйте в `C:\mkk\llama.cpp\`.

### 3.2 Скачать модель

Скачайте GGUF-модель (пример, ~5 GB):

- `Qwen2.5-7B-Instruct-Q4_K_M.gguf` с [Hugging Face](https://huggingface.co/Qwen)

Положите в `C:\mkk\models\`.

### 3.3 Запуск сервера

```powershell
cd C:\mkk\llama.cpp
.\llama-server.exe -m C:\mkk\models\Qwen2.5-7B-Instruct-Q4_K_M.gguf `
  --host 127.0.0.1 --port 8080 -c 4096 -t 8
```

- `-t 8` — число потоков CPU (подберите под ваш процессор).
- Первый запрос может занять 30–60 сек (загрузка модели в RAM).

Проверка (в другом окне PowerShell):

```powershell
curl http://127.0.0.1:8080/health
```

> **Ollama:** если позже обновите ОС и установите Ollama — смените только `OLLAMA_BASE_URL=http://127.0.0.1:11434` в `.env`.

---

## Шаг 4. Индексация документов (RAG)

1. Положите PDF/DOCX в `backend\uploads\knowledge\`  
   (или загрузите через админ-панель «База знаний»).

2. Запустите индексацию:

```powershell
cd C:\mkk\fund_portal\backend
.\.venv\Scripts\activate
python scripts\ingest_rag_documents.py
```

При первом запуске скачается модель эмбеддингов `BAAI/bge-m3` в `cache\fastembed\`.

Повторная индексация после добавления файлов:

```powershell
python scripts\ingest_rag_documents.py
```

---

## Шаг 5. Frontend

```powershell
cd C:\mkk\fund_portal\frontend
npm install
```

Создайте `frontend\.env.local`:

```env
NEXT_PUBLIC_API_PORT=8000
```

Сборка и запуск:

```powershell
npm run build
npx next start -H 0.0.0.0 -p 3000
```

Портал: `http://IP_СЕРВЕРА:3000`  
Вход: `admin` / `admin`

---

## Шаг 6. Firewall Windows

Разрешите входящие подключения для сотрудников в локальной сети:

```powershell
New-NetFirewallRule -DisplayName "MKK Portal" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "MKK API" -Direction Inbound -LocalPort 8000 -Protocol TCP -Action Allow
```

Порты 5432 и 8080 **не открывайте** наружу — только localhost / внутренняя сеть.

---

## Шаг 7. Автозапуск (службы Windows через NSSM)

Для production рекомендуется [NSSM](https://nssm.cc/) — запуск процессов как служб Windows.

### 7.1 llama.cpp

```powershell
nssm install MKK-LLM "C:\mkk\llama.cpp\llama-server.exe"
nssm set MKK-LLM AppParameters "-m C:\mkk\models\Qwen2.5-7B-Instruct-Q4_K_M.gguf --host 127.0.0.1 --port 8080 -c 4096 -t 8"
nssm set MKK-LLM AppDirectory "C:\mkk\llama.cpp"
nssm start MKK-LLM
```

### 7.2 Backend

```powershell
nssm install MKK-Backend "C:\mkk\fund_portal\backend\.venv\Scripts\uvicorn.exe"
nssm set MKK-Backend AppParameters "app.main:app --host 0.0.0.0 --port 8000"
nssm set MKK-Backend AppDirectory "C:\mkk\fund_portal\backend"
nssm start MKK-Backend
```

### 7.3 Frontend

```powershell
nssm install MKK-Frontend "C:\Program Files\nodejs\node.exe"
nssm set MKK-Frontend AppParameters "C:\mkk\fund_portal\frontend\node_modules\next\dist\bin\next start -H 0.0.0.0 -p 3000"
nssm set MKK-Frontend AppDirectory "C:\mkk\fund_portal\frontend"
nssm start MKK-Frontend
```

> Сначала выполните `npm run build` в папке frontend.

### Порядок запуска служб

1. PostgreSQL (или VM с БД)
2. MKK-LLM
3. MKK-Backend
4. MKK-Frontend

---

## Шаг 8. Быстрый запуск вручную (без NSSM)

Из корня проекта:

```powershell
# Терминал 1 — LLM
C:\mkk\llama.cpp\llama-server.exe -m C:\mkk\models\Qwen2.5-7B-Instruct-Q4_K_M.gguf --host 127.0.0.1 --port 8080 -c 4096 -t 8

# Терминал 2 — Backend
cd C:\mkk\fund_portal
.\scripts\start-backend-prod.ps1

# Терминал 3 — Frontend
cd C:\mkk\fund_portal
.\scripts\start-frontend-prod.ps1
```

---

## Обслуживание

| Задача | Команда |
|--------|---------|
| Добавить документы в RAG | Положить файлы в `uploads\knowledge\` → `python scripts\ingest_rag_documents.py` |
| Бэкап БД | `pg_dump fund_portal > backup.sql` |
| Бэкап загрузок | Копировать `backend\uploads\` |
| Логи backend | Смотреть вывод uvicorn / NSSM |
| Сменить модель LLM | Новый GGUF + перезапуск MKK-LLM |

---

## Устранение неполадок

| Симптом | Решение |
|---------|---------|
| AI: 503 «сервис недоступен» | Запустите llama-server, проверьте `OLLAMA_BASE_URL` |
| «Нет информации в документах» | Запустите `ingest_rag_documents.py` |
| Портал не открывается по IP | Firewall, `next start -H 0.0.0.0` |
| `CREATE EXTENSION vector` ошибка | Используйте БД в Linux VM (Шаг 1, вариант A) |
| Медленные ответы (>30 сек) | Уменьшите `-c` до 2048 или модель Q4_K_S |
| API CORS ошибка | Добавьте IP в `CORS_ORIGINS` в `backend\.env` |

---

## Связанные документы

- [README.md](README.md) — обзор портала
- [AI_SETUP.md](AI_SETUP.md) — детали RAG, модели, переменные окружения
- [LMS_README.md](LMS_README.md) — учебный портал
