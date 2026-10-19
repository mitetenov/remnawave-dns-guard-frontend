# Remnawave DNS Guard frontend

React UI и nginx-прокси для [DNS Guard backend](https://github.com/mitetenov/remnawave-dns-guard-backend).
[RU-агент](https://github.com/mitetenov/remnawave-dns-guard-agent) находится в отдельном репозитории.

## Разработка

Node.js 24:

```sh
npm ci
npm test
npm run build
npm run dev
```

Vite проксирует `/api` на `http://localhost:8000`. Backend должен быть запущен
отдельно с `PUBLIC_ORIGIN=http://localhost:5173` и `COOKIE_SECURE=false`.
UI обращается к API с того же origin; отдельный публичный API URL ему не нужен.
API-контракт находится в [CONTRACT.md бэкенда](https://github.com/mitetenov/remnawave-dns-guard-backend/blob/main/CONTRACT.md).

## Docker

```sh
docker build --platform linux/amd64 -t remnawave-dns-guard-frontend:local .
python3 scripts/smoke_image.py remnawave-dns-guard-frontend:local
```

Готовый образ: `mitetenov/remnawave-dns-guard-frontend:latest`.
nginx ожидает backend по адресу `backend:8000` в общей Docker-сети.
Образы поддерживают только `linux/amd64`; сборка для другой архитектуры завершается ошибкой.
Compose для всей панели и инструкции HTTPS находятся в репозитории бэкенда;
для запуска готовых образов исходники фронтенда на сервере не нужны.

Runtime использует официальный `nginx:1.28-alpine-slim` без дополнительных модулей, которые панель не использует. Node.js и зависимости сборки остаются только в build stage. Сначала устанавливаются зависимости по `package-lock.json`, затем копируются исходники UI. Кеш npm хранится в BuildKit; слой `npm ci` также переиспользуется через GitHub Actions layer cache. Документация и тесты исключены из Docker-контекста, а изменение nginx-конфига не пересобирает UI. Готовые assets и конфиги копируются независимыми `COPY --link` слоями.

## CI

Каждый push и pull request запускает Vitest, TypeScript/Vite build,
Docker-сборку и проверку запущенного nginx: HTML, статические файлы, SPA fallback,
security headers и проксирование `/api` на тестовый HTTP upstream.
После успешных проверок `main` публикует AMD64-образ в Docker Hub с тегами
`latest` и `sha-<полный commit SHA>`. Pull request ничего не публикует.
Deploy автоматически не выполняется.

Repository variables: `DOCKERHUB_USERNAME`, `DOCKERHUB_IMAGE`.
Repository secret: `DOCKERHUB_TOKEN` с правами Read & Write.
