# Развёртывание портала: Windows Server 2012 → Hyper-V → Ubuntu → Docker

Пошаговая инструкция: поднять виртуальную машину с Ubuntu на хосте Windows Server 2012 и запустить корпоративный портал через Docker Compose.

## Целевая схема

```
Windows Server 2012 (хост)
  └── Hyper-V VM: Ubuntu 22.04 / 24.04 LTS
        └── Docker Compose: db + backend + frontend
              Портал: http://<IP-ВМ>:3000
              API:     http://<IP-ВМ>:8000/docs
```

Рекомендуемые ресурсы ВМ:

| Ресурс | Минимум | Комфортно |
|--------|---------|-----------|
| vCPU | 4 | 6–8 |
| RAM | 8 GB | 16 GB |
| Диск | 40 GB | 60+ GB |

> AI-чат без Ollama работает в mock-режиме и не роняет API.  
> Подключение локальной модели: [RAG_SETUP.md](RAG_SETUP.md).

Связанные документы:

- [README.md](README.md) — краткий Ubuntu + Docker
- [DEPLOY_WINDOWS_SERVER.md](DEPLOY_WINDOWS_SERVER.md) — нативная установка на Win2012 без ВМ

---

## Часть 1. Hyper-V на Windows Server 2012

### 1.1. Включить роль Hyper-V

1. Откройте **Server Manager** → **Add Roles and Features**.
2. Выберите роль **Hyper-V** → Next → Install.
3. Перезагрузите сервер, если установщик попросит.

**Требования:**

- Редакция Windows Server **Standard** или **Datacenter**.
- В BIOS/UEFI хоста включены **Intel VT-x** или **AMD-V**.
- Достаточно свободной RAM и диска под ВМ.

### 1.2. Создать виртуальный коммутатор (сеть)

1. Откройте **Hyper-V Manager**.
2. Справа: **Virtual Switch Manager**.
3. **New virtual network switch** → тип **External**.
4. Имя: `ExternalSwitch`.
5. Выберите физическую сетевую карту сервера → OK.

ВМ получит IP в вашей локальной сети (как обычный ПК).

---

## Часть 2. Создать ВМ и установить Ubuntu

### 2.1. Скачать ISO Ubuntu

Скачайте **Ubuntu Server 22.04 LTS** или **24.04 LTS**:

- https://ubuntu.com/download/server

Положите ISO на хост, например:

```text
C:\ISO\ubuntu-22.04-live-server-amd64.iso
```

Server-образ предпочтительнее Desktop для серверной нагрузки.

### 2.2. Создать виртуальную машину

В **Hyper-V Manager**:

1. **Action** → **New** → **Virtual Machine**.
2. Имя: `fund-portal-ubuntu`.
3. Generation: **Generation 2** (предпочтительно). Если не грузится — используйте Generation 1.
4. Memory: **8192 MB** (лучше **16384**). Dynamic Memory для продакшена лучше отключить.
5. Network: `ExternalSwitch`.
6. Virtual Hard Disk: **40–60 GB**, формат VHDX.
7. Installation options: **Install an operating system from a bootable image file** → укажите ISO Ubuntu.
8. Finish.

### 2.3. Настройки ВМ перед первым запуском

ПКМ по ВМ → **Settings**:

- **Processor**: минимум **4** виртуальных CPU.
- **Security** (Gen2): при проблемах с загрузкой ISO отключите Secure Boot *или* выберите шаблон **Microsoft UEFI Certificate Authority**.
- **Firmware**: ISO первым в порядке загрузки.

### 2.4. Установить Ubuntu

1. ПКМ по ВМ → **Connect** → **Start**.
2. В установщике Ubuntu:
   - язык и раскладка;
   - сеть (обычно DHCP);
   - диск: **Use an entire disk**;
   - создайте пользователя (например `admin`) и пароль;
   - включите **Install OpenSSH server**.
3. Дождитесь окончания установки → Reboot.
4. После первой загрузки в Settings ВМ уберите ISO из DVD/boot, чтобы снова не стартовал установщик.

### 2.5. Узнать IP виртуальной машины

В консоли Ubuntu:

```bash
ip a
```

Найдите адрес вида `192.168.x.x` (интерфейс `eth0` / `ens*`).  
Дальше удобнее работать по SSH с вашего ПК:

```powershell
ssh admin@192.168.x.x
```

---

## Часть 3. Docker и запуск портала

Все команды ниже выполняются **внутри Ubuntu** (по SSH).

### 3.1. Обновить систему

```bash
sudo apt update && sudo apt upgrade -y
```

### 3.2. Установить Docker Engine + Compose plugin

```bash
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo usermod -aG docker $USER
```

Выйдите из SSH и зайдите снова (`exit`, затем повторный `ssh ...`), чтобы применилась группа `docker`.

Проверка:

```bash
docker --version
docker compose version
```

### 3.3. Клонировать репозиторий

```bash
sudo apt install -y git
cd ~
git clone https://github.com/semenoff86/fund_portal.git
cd fund_portal
```

### 3.4. Настроить окружение

```bash
cp .env.docker.example .env
nano .env
```

Обязательно задайте:

- `SECRET_KEY` — длинная случайная строка
- при необходимости пароль БД / `DATABASE_URL` (в `docker-compose.yml` по умолчанию `postgres` / `postgres`)

В nano: сохранить `Ctrl+O`, Enter; выйти `Ctrl+X`.

> Файлы с боевыми паролями и документы знаний в git не хранятся — настраиваются на сервере отдельно.

### 3.5. Собрать и запустить

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f backend
```

Дождитесь готовности БД и строки вроде `Starting API server`, затем `Ctrl+C` (логи остановятся, контейнеры продолжат работать).

При необходимости вручную:

```bash
docker compose exec backend alembic upgrade head
docker compose exec backend python seed.py
```

Entrypoint backend обычно применяет миграции и seed сам при старте.

### 3.6. Firewall на Ubuntu

```bash
sudo ufw allow 22/tcp
sudo ufw allow 3000/tcp
sudo ufw allow 8000/tcp
sudo ufw enable
sudo ufw status
```

### 3.7. Сеть / firewall на Windows Server 2012

- Трафик к ВМ через **External** switch обычно проходит без доп. правил на хосте.
- Если с других ПК сайт не открывается — проверьте корпоративный firewall: доступ к **IP ВМ** на порты **3000** и **8000**.

---

## Часть 4. Проверка

С любого ПК в локальной сети:

| Сервис | URL |
|--------|-----|
| Портал | `http://<IP-ВМ>:3000` |
| API / Swagger | `http://<IP-ВМ>:8000/docs` |

Демо-учётки (после seed):

| Логин | Пароль | Роль |
|-------|--------|------|
| admin | admin | Администратор |
| analyst | analyst | Сотрудник |

---

## Ежедневные операции

```bash
cd ~/fund_portal

docker compose ps              # статус
docker compose logs -f         # логи
docker compose restart         # перезапуск
docker compose down            # остановка
docker compose up -d --build   # пересборка после изменений
```

Обновление кода с GitHub:

```bash
cd ~/fund_portal
git pull
docker compose up -d --build
```

Полный сброс БД и volumes (данные пропадут):

```bash
docker compose down -v
docker compose up -d --build
```

---

## Типичные проблемы

| Проблема | Что проверить |
|----------|----------------|
| ВМ не стартует / «нет виртуализации» | BIOS: VT-x/AMD-V; роль Hyper-V установлена |
| Нет сети у ВМ | Коммутатор типа **External**, DHCP в LAN |
| Gen2 не грузит ISO | Secure Boot / шаблон UEFI; или создать Generation 1 |
| `permission denied` у `docker` | Перелогиниться после `usermod -aG docker` |
| Портал не открывается с другого ПК | `ip a`, `ufw status`, `ss -tlnp \| grep -E '3000\|8000'` |
| Долгая первая сборка | Нормально: качаются образы Python / Node / Postgres |

---

## Альтернатива без Hyper-V

Если роль Hyper-V недоступна (политика / редакция ОС), можно использовать **Oracle VirtualBox** (если разрешено политикой безопасности):

1. Создать ВМ с теми же ресурсами (4 CPU, 8–16 GB RAM, 40+ GB).
2. Сеть: **Bridged Adapter** (аналог External).
3. Установить Ubuntu с ISO.
4. Дальше — **Часть 3** без изменений.

---

## Чеклист готовности

- [ ] Hyper-V установлен, External switch создан
- [ ] ВМ Ubuntu запущена, SSH доступен
- [ ] Docker и Compose установлены
- [ ] Репозиторий склонирован, `.env` с `SECRET_KEY` заполнен
- [ ] `docker compose up -d --build` успешен
- [ ] Открывается `http://<IP>:3000`, вход `admin` / `admin`
