# Verificación — "Olvidé / restablecer contraseña"

Primera iteración (no existía `review.json`). Implementado desde `design.md` + `plan.md`,
con los 7 fixes aplicados.

## API (`/home/miguelzambrano/projects/Qhub/qhub-api`)

Comandos exactos y resultado (host Linux, Python 3.12.3; deps de runtime ejecutadas dentro
de la imagen `python:3.12-slim` vía Docker porque el host no las tiene instaladas):

- `python3 -m tests.test_password_reset` (host): **9/9 ok**
  - success path, unknown-email anti-enumeración, send-once, swallow en error de entrega,
    aislamiento de dos subcuentas, reset ok, token expirado (401), token usado (401 +
    idempotencia), enum round-trip (fix #7).
- Dentro de la imagen (deps instaladas desde `requirements.lock.txt`):
  - `python -c "from app.config.config import Settings; ..."` → **config OK** (4 settings nuevas).
  - `python -m tests.test_password_reset` → **9/9 ok**.
  - `python -m tests.test_password_reset_endpoints` → **5/5 ok**
    (/auth/recuperar mismo cuerpo exista o no el email; /auth/restablecer 200 válido / 401
    inválido; ResendEmailSender 200 ok y 4xx → PermanentDeliveryError, vía httpx.MockTransport).
  - `python -m tests.test_turn_ownership` (regresión) → **4/4 ok**.

Tipo de ejecución: unit test host-runnable; endpoints + regresión + config dentro de la
imagen Docker de la API.

## Web (`/home/miguelzambrano/projects/Qhub_Web`)

Node 22 en el host.

- `npm run generate` (design) → exit 0.
- `npm run typecheck` → **0 errores** en los 4 workspaces.
- `npm run test` → **34 archivos, 241 tests, todos verdes**, incluido
  `apps/web/src/app/auth-and-roles.test.tsx` (ruta "Credenciales inválidas" del diálogo de
  reconectar) y `apps/web/src/app/resolve-redirect.test.ts` (9 tests).
- `npm run test -w @qhub/api-client` → **4 archivos, 52 tests** (incluye el test de
  transporte de `requestPasswordReset`/`resetPassword`).

## Tests NUEVOS creados para esta feature

Enumerados aparte para poder borrarlos. **El usuario pidió explícitamente dejar el repo
limpio y quitar los tests**, así que se eliminaron tras verificar en verde:

- `qhub-api/tests/test_password_reset.py`
- `qhub-api/tests/test_password_reset_endpoints.py`
- `Qhub_Web/packages/api-client/test/password-reset.test.ts`
- `Qhub_Web/apps/web/src/features/qhub/CredentialsDialog.test.tsx`
- `Qhub_Web/apps/web/src/features/qhub/QhubRequestResetPage.test.tsx`
- `Qhub_Web/apps/web/src/features/qhub/QhubResetPasswordPage.test.tsx`

Tras eliminarlos se reconfirmó `npm run typecheck` (web) en verde y que los módulos API
tocados siguen parseando. El doble `FakeAuthRepository` (`apps/web/src/testing/fakes.ts`)
conserva los métodos `requestPasswordReset`/`resetPassword` (es infraestructura de testing,
no un test; se deja para que la interfaz siga compilando).

## PASO MANUAL OBLIGATORIO antes de que el flujo funcione

El repo de la API **no tiene mecanismo de migraciones**. Hay que aplicar a mano, en el SQL
Editor de Supabase, el archivo:

- `/home/miguelzambrano/projects/Qhub/qhub-api/sql/001_password_resets.sql`

Crea la tabla `password_resets`. Elegir la columna `propietario_tipo` como enum (por
defecto) o la variante comentada `text + check` según la instancia. Sin aplicar este DDL,
`/auth/recuperar` y `/auth/restablecer` fallarán al tocar la tabla.
