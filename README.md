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

В списке пулов и на странице пула доступно удаление с подтверждением: пул,
его профиль и узлы удаляются из панели, а A-записи Cloudflare сохраняются.
При удалении отдельного узла галочка «Удалить также A-запись» по умолчанию
выключена. Без неё сохраняется DNS-запись; с ней удаляется точная A-запись
с защитой последней записи пула.
Кнопка редактирования узла в таблице и мобильной карточке открывает заполненную
форму названия и IPv4. Смена IP сохраняет состояние узла и сбрасывает результаты
проверок; для активной A-записи новый адрес подтверждается до удаления старого.
Эти действия требуют backend с `DELETE /api/pools/{id}` и `PATCH /api/targets/{id}`.

## Профили XHTTP

Параметр `extra` из VLESS-ссылки или выбранного сервера подписки сохраняется
как JSON-объект `xhttp_extra`. Поле «XHTTP extra (JSON)» позволяет проверить,
изменить или очистить его перед сохранением. Поддерживаются padding, headers,
параметры POST и xmux закреплённого Xray v26.3.27; максимум 16 КиБ. Неизвестные
поля и отдельное подключение `downloadSettings` отклоняются. Переключение на
TCP очищает extra. Для использования обновите RU-агент до 1.1.0+, затем backend
и frontend: старые агенты не получают профили с новым полем.

## ALPN

TLS-профили поддерживают параметр `alpn` из VLESS-ссылки, включая импорт
вместе с XHTTP `extra`. Поле «ALPN» содержит протоколы через запятую; порядок
сохраняется, пустое поле оставляет стандартное поведение Xray. Для REALITY
отдельный ALPN не поддерживается. Требуются RU-агент 1.2.0+ и соответствующий
backend. Если в ссылке остаются неподдерживаемые параметры, UI перечисляет
сразу все их названия без значений.

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
