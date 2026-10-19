# syntax=docker/dockerfile:1
FROM --platform=$BUILDPLATFORM node:24-alpine AS build
ARG TARGETARCH
RUN test "$TARGETARCH" = "amd64" || { echo 'Only linux/amd64 images are supported' >&2; exit 1; }
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,id=guard-frontend-npm,target=/root/.npm \
    npm ci --prefer-offline --no-fund
# nginx configuration, docs and smoke tests do not affect the UI compilation.
COPY index.html tsconfig.json vite.config.ts ./
COPY src ./src
RUN npm run build

FROM nginx:1.28-alpine-slim
COPY --link nginx.conf /etc/nginx/conf.d/default.conf
COPY --link nginx.security-headers.conf /etc/nginx/security_headers.conf
COPY --link --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
