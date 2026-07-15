# LMS — Система обучения МКК

## Доступ

| Роль | Маршруты |
|------|----------|
| Все сотрудники | `/dashboard/lms` — назначенные курсы |
| admin, hr | `/dashboard/lms-admin` — управление курсами |

## Первый курс

1. Войдите как `admin` / `admin`
2. Откройте **LMS Admin** → **Создать курс**
3. Заполните шаги: основное → контент → настройки
4. На странице редактирования добавьте вопросы теста (минимум 1, рекомендуется 4 варианта ответа)
5. Назначьте курс сотрудникам: **Назначить** → выберите пользователей

## Назначение курсов

- `POST /api/admin/courses/{id}/assign` — назначение выбранным пользователям
- При назначении создаётся `CourseAssignment` и уведомление `COURSE_ASSIGNED`
- Bulk: `POST /api/admin/courses/assign/bulk` — несколько курсов × несколько пользователей

## Дедлайны

- Поле `deadline_days` на курсе — дней с момента назначения
- `deadline_date = assigned_at + deadline_days`
- Просроченные назначения переводятся в `EXPIRED` при обращении к API
- Ручная отправка напоминаний: кнопка «Напоминания о дедлайнах» в LMS Admin (за 3 дня)
- `POST /api/admin/lms/deadlines/extend` — продление дедлайна

## Прохождение теста

- Проходной балл по умолчанию: **80%**
- `max_attempts = -1` — безлимитные попытки
- При сдаче создаётся `QuizAttempt`, при успехе — `COURSE_COMPLETED`, иначе `TEST_FAILED`

## Аналитика

- Обзор: `/dashboard/lms-admin` и `/dashboard/lms-admin/analytics`
- Результаты по курсу: `/dashboard/lms-admin/courses/{id}/results`
- CSV-экспорт: `GET /api/admin/lms/reports/export`

## Уведомления

- Колокольчик в шапке портала
- Полный список: `/dashboard/notifications`
- Типы: `COURSE_ASSIGNED`, `DEADLINE_WARNING`, `DEADLINE_EXCEEDED`, `COURSE_COMPLETED`, `TEST_FAILED`

## Файлы курсов

- PDF/PPTX сохраняются в `backend/uploads/courses/`
- URL: `/uploads/courses/{filename}`

## Демо-данные

После `python seed.py` (новая БД):
- `admin` / `admin` — администратор
- `analyst` / `analyst` — с назначенными курсами

Пересборка Docker:
```powershell
docker compose up --build -d
```

## TODO: Phase 3 (частично закрыто)

- [x] Графики completion rate и распределения баллов (Recharts)
- [ ] Расширенный CSV с фильтрами по датам (API фильтры уже есть)
- [ ] Автоматический cron для дедлайнов (Celery / scheduled task)
- [x] UI продления дедлайна и история изменений
- [x] Блокировка просроченного теста + запрос/одобрение разблокировки
- [x] Массовое назначение курсов
- [x] Баннер срочных курсов в dashboard
