#!/usr/bin/env bash
# Verifica la plataforma web dentro de un contenedor Node (sin instalar Node en el host):
# instala dependencias, genera el design system, revisa tipos, corre tests y construye la web.
# Uso:  tool/verify.sh
set -euo pipefail
cd "$(dirname "$0")/.."

step() { printf '\n\033[1m▶ %s\033[0m\n' "$1"; }

# Variables VITE_* de build: se toman del .env de este repo (todas públicas).
if [[ -f .env ]]; then set -a; . ./.env; set +a; fi

NODE() {
  docker run --rm -u "$(id -u):$(id -g)" \
    -e HOME=/tmp/home -e npm_config_cache=/workspace/.npm-cache \
    -e VITE_APP_ENV -e VITE_QHUB_API_BASE_URL -e VITE_QHUB_WS_BASE_URL \
    -e VITE_SUPABASE_URL -e VITE_SUPABASE_PUBLISHABLE_KEY \
    -v "$PWD":/workspace -w /workspace node:22-slim bash -lc "$1"
}

step "Instalación (npm workspaces)"
NODE 'npm install --no-audit --no-fund 2>&1 | tail -2'

step "Generación del design system (tokens, Tailwind, íconos)"
NODE 'npm run generate -w @qhub/design'

step "Tipos (TypeScript estricto) en paquetes y web"
NODE 'npm run typecheck'

step "Tests: core · api-client · design · web"
NODE 'npm run test --workspaces --if-present'

step "Build de la plataforma web (Vite → apps/web/dist)"
NODE 'npm run build -w @qhub/web 2>&1 | grep -E "built|error"'

printf '\n\033[32m✔ Verificación completa\033[0m\n'
