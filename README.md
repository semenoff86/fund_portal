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
│   ├── app/
│   │   ├── models.py
│   │   ├── routers/      # admin, lms_admin, lms_user, notifications, …
│   │   └── services/
│   └── seed.py
├── frontend/             # Next.js
├── templates/documents/  # Docx-шаблоны сервис-деска
├── scripts/              # docker-up.ps1, start-backend.ps1, start-frontend.ps1
├── docker-compose.yml
└── LMS_README.md         # Подробно про LMS
```

## Развёртывание на сервере (Windows Server 2012)

Для production на **Windows Server 2012** (CPU, без Docker) — пошаговая инструкция:

**[DEPLOY_WINDOWS_SERVER.md](DEPLOY_WINDOWS_SERVER.md)**

Кратко: PostgreSQL + pgvector → llama.cpp (Qwen 7B) → backend (Python) → frontend (Node 18). Docker на Win2012 не рекомендуется.

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

```powershell
cd frontend
npm install
copy .env.local.example .env.local
npm run dev
```

Или из корня: `.\scripts\start-frontend.ps1` (скрипт лежит в `scripts/`, не в `frontend/`).

### БД (если без Docker)

```bash
createdb fund_portal
psql fund_portal -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

Для локального backend нужен доступ к PostgreSQL (например, `docker compose up -d db`).

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
| Auth | `POST /api/auth/login`, `POST /api/auth/logout` |
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
- JWT для API
- `AuthGuard` на фронтенде
- CORS: localhost (3000–3001) и частные IP в LAN

## Следующие этапы

- [ ] Семантический поиск через pgvector embeddings
- [x] Интеграция LLM для AI-ассистента (RAG) — см. [AI_SETUP.md](AI_SETUP.md)
- [ ] Alembic-миграции для production
- [ ] Refresh-токены и ротация сессий
- [ ] LMS Phase 3: графики, cron для дедлайнов (см. LMS_README.md)
