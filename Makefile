# Apply database migrations (Alembic). Run from repo root:
#   make migrate
# Or from backend/:
#   alembic upgrade head

.PHONY: migrate migrate-revision migrate-history

migrate:
	cd backend && alembic upgrade head

migrate-revision:
	cd backend && alembic revision --autogenerate -m "$(m)"

migrate-history:
	cd backend && alembic history
