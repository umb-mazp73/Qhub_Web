# Qhub Web

Plataforma web de Qhub (React 19 + Vite + TanStack Query + React Router + Tailwind v4).
Repo independiente, pensado para desplegar en **Vercel**. La app móvil vive en otro repo
(`Qhub_App`); aquí solo está la web y sus paquetes compartidos (`@qhub/core`,
`@qhub/api-client`, `@qhub/design`).

La web no necesita la carpeta `supabase/`: llama a las Edge Functions ya desplegadas por HTTP
y usa únicamente variables de entorno públicas.

## Estructura

```
packages/core        @qhub/core        — utilidades compartidas
packages/api-client  @qhub/api-client  — cliente de la API Qhub
packages/design      @qhub/design      — design system (genera tokens/Tailwind/íconos)
apps/web             @qhub/web         — la aplicación web (Vite)
```

Es un monorepo con **npm workspaces**, así los imports `@qhub/*` resuelven sin cambios.

## Variables de entorno

Todas son **públicas** (`VITE_*`, van en el bundle). Ponlas en el `.env` de la raíz
(gitignored). En Vercel se configuran en *Project Settings → Environment Variables*.

| Variable | Qué es |
| --- | --- |
| `VITE_APP_ENV` | entorno (`production`) |
| `VITE_QHUB_API_BASE_URL` | URL pública de la API Qhub en Render (`https://…`) |
| `VITE_QHUB_WS_BASE_URL` | WebSocket de la API Qhub (`wss://…`) |
| `VITE_SUPABASE_URL` | URL del proyecto Supabase (`https://xxxx.supabase.co`) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | anon/publishable key (pública) |

## Desarrollo y build (en Docker, sin instalar Node en el host)

Se usa la imagen `node:22-slim`. Comando base:

```bash
docker run --rm -u $(id -u):$(id -g) -e HOME=/tmp/home \
  -v "$PWD":/w -w /w node:22-slim bash -lc '<comando>'
```

Pasos típicos:

```bash
# instalar dependencias
… bash -lc 'npm install'
# generar el design system
… bash -lc 'npm run generate -w @qhub/design'
# tipos + tests
… bash -lc 'npm run typecheck && npm run test --workspaces --if-present'
# build de producción (deja el sitio en apps/web/dist)
… bash -lc 'npm run build'
```

O todo de una con `tool/verify.sh` (lee las `VITE_*` de tu `.env`).

## Despliegue en Vercel

`vercel.json` ya configura el proyecto como SPA de Vite:

- **Install Command:** `npm install`
- **Build Command:** `npm run build` (ejecuta `generate` del design system y luego `vite build`)
- **Output Directory:** `apps/web/dist`
- **Rewrites:** todas las rutas → `/index.html` (para React Router)

En Vercel: crea el proyecto apuntando a este repo, añade las 5 variables `VITE_*`
en *Environment Variables* y despliega.
