# syntax=docker/dockerfile:1

FROM node:26-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Self-contained runtime: static files + nginx, no Node, no outbound calls, runs as non-root.
FROM nginxinc/nginx-unprivileged:1.27-alpine
ARG VERSION=dev
ARG REVISION=unknown
LABEL org.opencontainers.image.title="Gateway Forge" \
      org.opencontainers.image.description="Client-side visual config builder for Omnissa Unified Access Gateway (UAG)" \
      org.opencontainers.image.source="https://github.com/erikgraa/gateway-forge" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${REVISION}"
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
