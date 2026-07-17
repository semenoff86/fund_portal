# МКК — Корпоративный портал (MVP)

Внутренний корпоративный портал для сотрудников микрокредитной компании.

## Стек

| Слой | Технологии |
|------|------------|
| Backend | Python, FastAPI, SQLAlchemy, bcrypt, python-jose |
| БД | PostgreSQL + pgvector |
| Frontend | Next.js 14 (App Router), Tailwind CSS, shadcn/ui, sonner |
| Инфраструктура | Docker Compose |

## Структура проекта

```
fund_portal/
├── backend/              # FastAPI API
│   ├── alembic/          # Alembic migrations
│   ├── app/
│   │   ├── models.py
│   │   ├── routers/      # admin, lms_admin, lms_user, notifications, …
│   │   ├── services/
│   │   └── utils/        # file_validator (magic bytes)
│   ├── scripts/migrate.sh
│   └── seed.py
├── frontend/             # Next.js
├── templates/documents/  # Docx-шаблоны сервис-деска
├── scripts/              # docker-up.ps1, start-backend.ps1, start-frontend.ps1
├── Makefile              # make migrate
├── docker-compose.yml
└── LMS_README.md         # Подробно про LMS
```

## Развёртывание на сервере (Windows Server 2012)

Два рабочих варианта:

| Сценарий | Документ |
|----------|----------|
| **ВМ Ubuntu в Hyper-V** + Docker Compose (рекомендуется для портала) | **[DEPLOY_UBUNTU_HYPERV.md](DEPLOY_UBUNTU_HYPERV.md)** |
| Нативная установка на Win2012 без Docker | [DEPLOY_WINDOWS_SERVER.md](DEPLOY_WINDOWS_SERVER.md) |

Кратко про нативный путь: PostgreSQL + pgvector → llama.cpp (Qwen 7B) → backend (Python) → frontend (Node 18). Docker напрямую на Win2012 не рекомендуется.

---

## Развёртывание на Ubuntu (production)

Целевая среда: **Ubuntu 22.04 / 24.04** + Docker Compose.

### 1. Установить Docker

```bash
sudo apt update
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo usermod -aG docker $USER
# перелогиньтесь в SSH, чтобы группа docker применилась
```

### 2. Клонировать репозиторий

```bash
git clone <URL-репозитория> fund_portal
cd fund_portal
```

### 3. Настроить окружение

```bash
cp .env.docker.example .env
# или: cp backend/.env.example backend/.env
nano .env
```

Обязательно задайте:

- `SECRET_KEY` — длинная случайная строка
- пароль PostgreSQL / `DATABASE_URL` (если меняете дефолт `postgres/postgres`)

### 4. Собрать и запустить

```bash
docker compose up -d --build
docker compose ps
```

### 5. Миграции и seed

Entrypoint backend обычно применяет миграции сам. При необходимости вручную:

```bash
docker compose exec backend alembic upgrade head
docker compose exec backend python seed.py
```

### 6. Проверка

| Сервис | URL |
|--------|-----|
| Портал | `http://<IP-сервера>:3000` |
| API / Swagger | `http://<IP-сервера>:8000/docs` |

Демо: `admin` / `admin`

Firewall:

```bash
sudo ufw allow 22/tcp
sudo ufw allow 3000/tcp
sudo ufw allow 8000/tcp
sudo ufw enable
```

AI-чат без Ollama отвечает mock-сообщением о настройке и **не роняет** API.  
Подключение LLM: [RAG_SETUP.md](RAG_SETUP.md).

---

## Быстрый запуск (Docker) — для разработки

Требуется [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows 10/11 или Linux).

```powershell
# Из корня проекта fund_portal
docker compose up --build -d
```

Или через скрипт (проверит порты 3000 и 8000):

```powershell
.\scripts\docker-up.ps1
```

Перед запуском остановите локальные `npm run dev` и `uvicorn`, если они занимают порты 3000/8000.

| Сервис | URL |
|--------|-----|
| Портал | http://localhost:3000 |
| API | http://localhost:8000 |
| Swagger | http://localhost:8000/docs |

Остановка: `docker compose down`  
Полный сброс БД: `docker compose down -v`

После изменений в коде:

```powershell
docker compose up --build -d
```

Доступ из локальной сети: `http://<IP-сервера>:3000` (API на порту 8000 того же IP).

## Демо-учётные записи

| Логин | Пароль | Роль | Примечание |
|-------|--------|------|------------|
| admin | admin | Администратор | Полный доступ, админ-панель, LMS Admin |
| analyst | analyst | Аналитик | Демо-сотрудник с назначенными курсами |

> Учётки создаются при первом `seed.py`. Если БД уже была засеяна раньше, выполните `docker compose down -v` для сброса или создайте пользователей вручную.

---

## Локальная разработка (без Docker)

### Требования

- Python 3.11+
- Node.js 18+
- PostgreSQL 15+ с [pgvector](https://github.com/pgvector/pgvector)

### Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env   # укажите DATABASE_URL и SECRET_KEY
python seed.py
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Или из корня: `.\scripts\start-backend.ps1`

### Frontend

```bash
cd frontend
npm install
# recharts уже в package.json; при необходимости: npm install recharts
cp .env.local.example .env.local
npm run dev
```

Или из корня: `.\scripts\start-frontend.ps1` (скрипт лежит в `scripts/`, не в `frontend/`).

### БД (если без Docker)

```bash
createdb fund_portal
psql fund_portal -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

Для локального backend нужен доступ к PostgreSQL (например, `docker compose up -d db`).

### Миграции БД (Alembic)

Схема управляется через Alembic (каталог `backend/alembic/`).

**Windows (PowerShell):**

```powershell
# PostgreSQL должен быть запущен (например: docker compose up -d db)
.\scripts\migrate.ps1

# Или напрямую:
cd backend
.\.venv\Scripts\python.exe -m alembic upgrade head
```

**Linux / macOS / Git Bash:**

```bash
make migrate
# или
./scripts/migrate.sh
# или
cd backend && alembic upgrade head
```

Новая ревизия после изменения моделей:

```powershell
cd backend
.\.venv\Scripts\python.exe -m alembic revision --autogenerate -m "describe_change"
```

**Существующая БД** (созданная через `create_all` / `seed.py` без Alembic):

```powershell
cd backend
.\.venv\Scripts\python.exe -m alembic stamp head
```

В Docker entrypoint миграции применяются автоматически при старте `backend`.

> PostgreSQL extensions: `vector` (pgvector) и `pg_trgm` (fuzzy search).  
> Вручную: `CREATE EXTENSION IF NOT EXISTS pg_trgm;`

AI / RAG: см. [RAG_SETUP.md](RAG_SETUP.md).

---

## Модули портала

| Модуль | Маршрут | Описание |
|--------|---------|----------|
| База знаний | `/dashboard/knowledge` | Приказы и регламенты |
| Учебный портал | `/dashboard/lms` | Назначенные курсы, тесты, прогресс |
| Сервис-деск | `/dashboard/servicedesk` | Заявки и генерация документов |
| AI-ассистент | `/dashboard/ai-chat` | RAG-чат по документам с цитатами |
| Уведомления | `/dashboard/notifications` | Центр уведомлений |
| Личный кабинет | `/dashboard/profile` | Профиль и аватар |
| Администрирование | `/dashboard/admin` | Пользователи, шаблоны, приказы (`admin`) |
| Журнал действий | `/dashboard/admin/audit` | Аудит операций, фильтры по пользователю/действию/периоду (`admin`) |
| LMS Admin | `/dashboard/lms-admin` | Курсы, назначения, аналитика (`admin`, `hr`) |

Старый маршрут `/dashboard/training` перенаправляет на `/dashboard/lms`.

---

## Панель администратора (`/dashboard/admin`)

Доступ: роль **admin**.

| Раздел | Возможности |
|--------|-------------|
| Пользователи | Создание, блокировка, удаление |
| Шаблоны документов | Загрузка `.docx` / `.pdf` |
| База знаний | CRUD приказов |
| Журнал действий | `/dashboard/admin/audit` — просмотр аудита |

### Журнал действий (`/dashboard/admin/audit`)

Доступ: только **admin**. Просмотр без экспорта.

**Что пишется в журнал:**
- вход, выход, неудачный вход;
- изменения пользователей, шаблонов, базы знаний;
- операции LMS Admin (курсы, тесты, назначения, дедлайны).

**Поля записи:** кто, когда, действие, объект (тип + id), результат (успех/ошибка), IP.

**Фильтры:** пользователь, тип действия, период.

**Хранение:** по умолчанию 12 месяцев (`AUDIT_RETENTION_MONTHS` в `backend/.env`; `0` — не удалять). Старые записи чистятся при старте API и при открытии журнала.

Сообщения чата AI в журнал не пишутся.

## LMS Admin (`/dashboard/lms-admin`)

Доступ: роли **admin** и **hr**. Подробности — в [LMS_README.md](LMS_README.md).

---

## Хранение файлов

| Тип | Путь на диске | URL |
|-----|---------------|-----|
| Шаблоны (админ) | `backend/uploads/templates/` | `/uploads/templates/…` |
| Приказы (админ) | `backend/uploads/knowledge/` | `/uploads/knowledge/…` |
| Материалы курсов (LMS) | `backend/uploads/courses/` | `/uploads/courses/…` |
| Аватары | `backend/uploads/avatars/` | `/uploads/avatars/…` |
| Docx-шаблоны сервис-деска | `templates/documents/source/` | через API генерации |

---

## API (основное)

Полный список: http://localhost:8000/docs

| Группа | Примеры |
|--------|---------|
| Auth | `POST /api/auth/login`, `POST /api/auth/refresh`, `POST /api/auth/logout` |
| Profile | `GET/PUT /api/profile/me`, `POST /api/profile/avatar` |
| База знаний | `GET /api/orders` |
| Сервис-деск | `POST/GET /api/requests`, `GET /api/document-templates` |
| LMS (пользователь) | `GET /api/lms/courses`, `POST /api/lms/courses/{id}/quiz/submit` |
| LMS (admin/hr) | `GET/POST /api/admin/courses`, `POST /api/admin/courses/{id}/assign` |
| Админ | `GET/POST /api/admin/users`, `/api/admin/knowledge`, `/api/admin/templates` |
| Журнал действий | `GET /api/admin/audit`, `GET /api/admin/audit/actions` (только `admin`) |
| Уведомления | `GET /api/notifications`, `GET /api/notifications/unread-count` |
| AI (RAG) | `POST /api/chat/sessions`, `POST /api/chat/sessions/{id}/message` |

Все `/api/admin/*` (кроме LMS для hr) и LMS admin — только для ролей **admin** / **hr**.

---

## Безопасность

- Пароли: bcrypt
- JWT access-токен (по умолчанию **15 минут**) + opaque **refresh-токен** (по умолчанию **7 дней**, хеш в таблице `refresh_tokens`)
- Rate limit на логин: **5 запросов / минуту** (SlowAPI)
- Журнал действий (`audit_logs`) для входа/выхода и мутаций
- Строгая проверка загрузок: размер, расширение и magic bytes (PDF / DOCX / JPG / PNG / …)
- `AuthGuard` на фронтенде
- CORS: localhost (3000–3001) и частные IP в LAN

### Refresh Token flow

1. `POST /api/auth/login` → `{ access_token, refresh_token, expires_in, token_type }`
2. Клиент хранит оба токена (frontend: `localStorage`)
3. API-запросы идут с `Authorization: Bearer <access_token>`
4. При `401` клиент вызывает `POST /api/auth/refresh` с `{ "refresh_token": "..." }` и получает новый `access_token`
5. `POST /api/auth/logout` отзывает все refresh-токены пользователя (сессия больше не продлевается)

Конфиг (`.env`):

```
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=7
```

## Следующие этапы

- [x] Семантический поиск через pgvector embeddings (hybrid: PGVector + pg_trgm)
- [x] Интеграция LLM для AI-ассистента (RAG) — см. [AI_SETUP.md](AI_SETUP.md) и [RAG_SETUP.md](RAG_SETUP.md)
- [x] Alembic-миграции для production
- [x] Refresh-токены и ротация сессий
- [x] Версионирование документов БЗ + hybrid search (`pg_trgm` + PGVector)
- [ ] LMS Phase 3: графики, cron для дедлайнов (см. LMS_README.md)
