# Implementation Plan — "Olvidé / restablecer contraseña" (Qhub API + Qhub Web)

Implements the approved design in `.agents/tasks/forgot-reset-password/design.md` and the 7
required fixes from `design-review.md`. Two repos, edited in place (no worktree):

- **API** (Python 3.12 / FastAPI): `/home/miguelzambrano/projects/Qhub/qhub-api` (call it `<API>`)
- **Web** (TypeScript / React / Vite monorepo): `/home/miguelzambrano/projects/Qhub_Web` (call it `<WEB>`)

Step agents run with cwd = `<WEB>`. **Always use the absolute `<API>` path above when touching the API repo.**

## Build / test commands discovered during exploration

- **API has no pytest config, no conftest, and pytest is NOT installed/pinned** (`requirements.txt` has no pytest; host `python3 -m pytest` → "No module named pytest"). The one existing test `<API>/tests/test_turn_ownership.py` is **self-running**: it ends with `if __name__ == "__main__": for name, fn ... fn()` and uses plain `asyncio.run` + hand-written in-memory fakes, no test framework. **New API tests MUST follow this exact self-running pattern** so they run with `python3 -m tests.<module>` without installing anything.
- The API targets Python 3.12 (`dockerfile` = `python:3.12-slim`); host has `python3` 3.12.3. Runtime deps (`fastapi`, `httpx`, `bcrypt`, `pydantic`, `dependency-injector`, `supabase`) are installed only inside the Docker image, not necessarily on the host. **API verification command:** run each new test module from `<API>` with `python3 -m tests.<module_name>` and expect it to print `ok <test_name>` for each test and exit 0. If a module import fails on the host because a runtime dep is missing, run the same command inside the API image: `docker run --rm -v "<API>":/app -w /app python:3.12-slim bash -lc 'pip install --no-cache-dir -r requirements.lock.txt >/dev/null && python -m tests.<module_name>'`. State in the final summary which path was used.
- **Web** is an npm-workspaces monorepo; per `<WEB>/README.md` it builds/tests in a `node:22-slim` Docker container. Scripts: root `npm run typecheck` (→ `tsc --noEmit` per workspace) and `npm run test` (→ `vitest run` per workspace). **Web verification commands** (from `<WEB>`):
  - `npm run typecheck` — expect 0 type errors.
  - `npm run test` — expect all vitest suites green, including `apps/web/src/app/auth-and-roles.test.tsx`.
  - If Node is not on the host, wrap in the README's Docker form: `docker run --rm -u $(id -u):$(id -g) -e HOME=/tmp/home -v "$PWD":/w -w /w node:22-slim bash -lc 'npm install && npm run generate -w @qhub/design && npm run typecheck && npm run test --workspaces --if-present'`.

## Grounding facts verified in code (do not re-derive)

- API login path is `POST /auth/token`, register is `POST /auth/registro` (`<API>/app/api/routers/auth.py`). New endpoints `/auth/recuperar` and `/auth/restablecer` do not collide. `/auth/*` is public on the web transport.
- `AuthUseCases.__init__` currently takes exactly `(accounts, passwords, api_keys, tokens, clock)` and sets `self._dummy_hash=None`; `_burn_verification(self, password: str)` exists (`<API>/app/application/use_cases/auth.py`).
- `SupabaseAccountRepository` uses `self._client.table(...).select(...)....execute()`; `find_login` iterates `((EMPRESA,"control_empresas","empresa_id"),(USUARIO,"usuarios","id"))` (`<API>/app/infrastructure/persistence/supabase/account_repository.py`).
- `PersistenceFailure(operation, detail="...")`, `Unauthorized(detail, reason)`, `PermanentDeliveryError(detail, channel, reason)` all exist with those signatures (`<API>/app/application/errors.py`).
- `Dependencies.auth` is a declarative `providers.Factory(AuthUseCases, accounts, password_hasher, api_keys, tokens, clock)`; resolved in `build_container` via `auth = container.auth()` (`<API>/app/dependencies/Dependencies.py`). Delivery dir today holds only `__init__.py` + `log_channel.py`.
- `<WEB>` `resolve-redirect.ts`: `o.location` is passed **pathname only** (the `Gate` in `AppRoutes.tsx` destructures `{ pathname, search }` and passes `location: pathname`). The guard `if (!o.signedIn) return here === '/login' ? null : '/login';` runs before any specific-route check → confirms fix #3 needs the `/qhub/*` early-return placed **above** that guard, and a prefix/normalize match for `/qhub/restablecer` because the email link carries `?token=`.
- `CredentialsDialog` today renders exactly `{err && <Notice kind="error" title={err} />}` and its prop signature is `{ title, intro, confirmLabel, rememberLabel, onSubmit, onCancel }` (`<WEB>/apps/web/src/features/qhub/CredentialsDialog.tsx`). `Notice` supports `action?: ReactNode`.
- `CredentialsDialog` is mounted in `ReconnectBanner.tsx` and `SettingsPage.tsx` (both authenticated). `SettingsPage` mounts it as `dialog === 'connect'`.
- Registration lives at `ConnectPage` route `/connect` (`AppRoutes.tsx`); its tab index 1 is "Crear cuenta".
- `validatePassword(v, { email? })` rejects `>72` with "Usa 72 caracteres como máximo." (`<WEB>/packages/core/src/validation.ts`). `validateEmail` exists there too.
- `FakeAuthRepository` (in `<WEB>/apps/web/src/testing/fakes.ts`) implements only `login`/`register` and imports `ok/err/Failure/Result` from `@qhub/core`. `FakeSecurity.requestPasswordReset` is a **different** method (web platform) — do NOT touch it.
- `auth-and-roles.test.tsx` already drives the "Credenciales inválidas" path inside the Reconnect dialog; the new help links must stay **optional** and render only when `onForgot`/`onRegister` callbacks are provided, so that test keeps passing unchanged.

---

# Phase A — API (`<API>`)

- [ ] 1. Create the manually-applied DDL file `sql/001_password_resets.sql` with the `password_resets` table exactly as in design.md (`id` uuid PK default `gen_random_uuid()`, `propietario_tipo` enum, `propietario_id` uuid, `account_id` uuid, `token_hash` text unique, `email` text, `expira_en` timestamptz, `usado_en` timestamptz null, `creada_en` timestamptz default now()), plus the two indexes. Include the header comment that the project does not version schema and this must be applied by hand in the Supabase SQL editor, the commented `text + check` fallback variant for `propietario_tipo`. **Fix #6:** add a comment stating `account_id`/`propietario_id` are LOGICAL references (no FK due to the empresa/usuario polymorphism) and that rows expire by TTL / `usado_en`. **Fix #7:** add a comment next to the enum note recording the assumption that the column stores the enum `.value` (`'empresa'`/`'usuario'`), matching `PropietarioTipo(...)` on read.
      Files: `<API>/sql/001_password_resets.sql`
      Verify: `python3 -c "import pathlib,re; s=pathlib.Path('<API>/sql/001_password_resets.sql').read_text(); assert 'create table' in s.lower() and 'password_resets' in s and 'token_hash' in s and 'account_id' in s"` from `<API>` exits 0. (This file is applied by hand in Supabase; it is not executed by the test suite.)

- [ ] 2. Add the 4 new settings to `app/config/config.py` following the existing field + `@field_validator` style: `RESEND_API_KEY: str = ""`, `EMAIL_FROM: str = "onboarding@resend.dev"`, `PASSWORD_RESET_URL: str = "http://localhost:5173"`, `PASSWORD_RESET_TTL_MINUTOS: int = 60`, plus a `_ttl_positivo` validator mirroring `_max_intentos_positivo` (raise if `< 1`).
      Files: `<API>/app/config/config.py`
      Verify: `python3 -c "from app.config.config import Settings; s=Settings(); assert s.EMAIL_FROM=='onboarding@resend.dev' and s.PASSWORD_RESET_URL=='http://localhost:5173' and s.PASSWORD_RESET_TTL_MINUTOS==60 and hasattr(s,'RESEND_API_KEY')"` from `<API>` exits 0 (pydantic/pydantic-settings is a runtime dep — if not on host, run inside the API image per the commands section).

- [ ] 3. Append the 3 new keys to `<API>/.env` with the Spanish comments from design.md (`EMAIL_FROM`, `PASSWORD_RESET_URL`, `PASSWORD_RESET_TTL_MINUTOS`). `RESEND_API_KEY` is already present — do NOT add it again. **Do NOT read back, echo, modify, or reformat** the existing secret values (`SUPABASE_KEY`, `JWT_SECRET_KEY`, `RABBITMQ_URL`, `ADMIN_API_KEY`, `RESEND_API_KEY`): append-only. First grep the file for each key name to decide what is missing; append only the absent ones.
      Files: `<API>/.env`
      Verify: `grep -q '^EMAIL_FROM=' <API>/.env && grep -q '^PASSWORD_RESET_URL=' <API>/.env && grep -q '^PASSWORD_RESET_TTL_MINUTOS=' <API>/.env` exits 0; and `grep -c '^RESEND_API_KEY=' <API>/.env` prints `1` (not duplicated). Confirm the pre-existing secret lines are byte-for-byte unchanged (compare against git: `cd <API> && git diff .env` shows only added lines, no modified ones).

- [ ] 4. Add the two frozen command dataclasses `RequestPasswordReset(email: str)` and `ResetPassword(token: str, new_password: str)` to `app/domain/models.py` (style of `LoginCommand`/`RegisterAccount`).
      Files: `<API>/app/domain/models.py`
      Verify: `python3 -c "from app.domain.models import RequestPasswordReset, ResetPassword; RequestPasswordReset(email='a@b.co'); ResetPassword(token='t', new_password='p')"` from `<API>` exits 0.

- [ ] 5. Add the three value objects to `app/domain/value_objects.py` (style of `LoginRecord`): `ResetTarget(owner: OwnerId, account_id: UUID, email: str)`, `PasswordResetRecord(id: UUID, owner: OwnerId, account_id: UUID, email: str, expira_en: datetime, usado_en: datetime | None)`, and `EmailJob(to: str, subject: str, html: str)`. Add any missing imports (`UUID`, `datetime`).
      Files: `<API>/app/domain/value_objects.py`
      Verify: `python3 -c "from app.domain.value_objects import ResetTarget, PasswordResetRecord, EmailJob"` from `<API>` exits 0.

- [ ] 6. Create the email sender Protocol `app/domain/interfaces/email.py` with `class EmailSender(Protocol): async def send(self, *, to: str, subject: str, html: str) -> None: ...` (contract: silent return = success; raise `PermanentDeliveryError` on non-recoverable send failure).
      Files: `<API>/app/domain/interfaces/email.py`
      Verify: `python3 -c "from app.domain.interfaces.email import EmailSender"` from `<API>` exits 0.

- [ ] 7. Add the 6 new method signatures to the `AccountRepository` Protocol in `app/domain/interfaces/accounts.py`, matching design.md: `find_reset_target(email_norm) -> ResetTarget | None`, `create_password_reset(target, token_hash, expira_en) -> None`, `find_valid_reset(token_hash, now) -> PasswordResetRecord | None`, `mark_reset_used(reset_id, used_at) -> None`, `update_password_hash(owner, account_id, password_hash) -> None`, `invalidate_resets_for_account(owner, account_id, now) -> None`. Import the new value objects/`UUID`/`datetime` as needed.
      Files: `<API>/app/domain/interfaces/accounts.py`
      Verify: `python3 -c "from app.domain.interfaces.accounts import AccountRepository; assert all(hasattr(AccountRepository,m) for m in ('find_reset_target','create_password_reset','find_valid_reset','mark_reset_used','update_password_hash','invalidate_resets_for_account'))"` from `<API>` exits 0.

- [ ] 8. Implement the 6 methods in `app/infrastructure/persistence/supabase/account_repository.py`, mirroring `find_login`. Each method wraps its `.execute()` in `try/except Exception` and raises `PersistenceFailure(operation="<method_name>")` (import from `app.application.errors`); **do NOT reuse `map_registration_error`** for these methods. Specifics:
      - `find_reset_target(email_norm)`: iterate the same `((EMPRESA,"control_empresas","empresa_id"),(USUARIO,"usuarios","id"))` tuple, email-only. **Fix #1:** build columns without duplication — `cols = "id, email" if owner_column == "id" else f"id, {owner_column}, email"`. **Fix #2:** compare with case-insensitive EQUALITY, not `ilike`: `.eq("email", email_norm)` (email is already normalized/lowercased on write at registration). Map `account_id = UUID(str(row["id"]))`, `owner = OwnerId(owner_type, UUID(str(row[owner_column])))`, `email = str(row["email"])`. Return `None` if no row in either table.
      - `create_password_reset(target, token_hash, expira_en)`: insert row with `propietario_tipo=target.owner.tipo.value`, `propietario_id=str(target.owner.id)`, `account_id=str(target.account_id)`, `token_hash`, `email=target.email`, `expira_en=expira_en.isoformat()`. The bounded retry on `23505` is optional; base behavior (translate to `PersistenceFailure`) is acceptable and preserves anti-enumeration.
      - `find_valid_reset(token_hash, now)`: `.select("*").eq("token_hash", token_hash).is_("usado_en","null").gte("expira_en", now.isoformat()).limit(1)`. Map to `PasswordResetRecord` with `owner=OwnerId(PropietarioTipo(row["propietario_tipo"]), UUID(str(row["propietario_id"])))`, `account_id=UUID(str(row["account_id"]))`.
      - `mark_reset_used(reset_id, used_at)`: `.update({"usado_en": used_at.isoformat()}).eq("id", str(reset_id))`.
      - `update_password_hash(owner, account_id, password_hash)`: table by type (`control_empresas` for EMPRESA, `usuarios` for USUARIO), always `.update({"password_hash": password_hash}).eq("id", str(account_id))`. **Fix #5-defense:** after execute, assert exactly one row affected (`len(result.data) == 1`); else raise `PersistenceFailure(operation="update_password_hash")`. Never use `.ilike("email", ...)`.
      - `invalidate_resets_for_account(owner, account_id, now)`: `.update({"usado_en": now.isoformat()}).eq("propietario_tipo", owner.tipo.value).eq("account_id", str(account_id)).is_("usado_en","null")`.
      **Fix #2 global rule:** every email comparison in the new reset flow uses `.eq` on the normalized (lowercased) email, never `.ilike`.
      Files: `<API>/app/infrastructure/persistence/supabase/account_repository.py`
      Verify: covered by step 15's self-running test (uses a fake repo + a real-logic subset where applicable); as a smoke check `python3 -c "import ast,sys; ast.parse(open('<API>/app/infrastructure/persistence/supabase/account_repository.py').read())"` exits 0 and `grep -q 'cols = \"id, email\"' <API>/app/infrastructure/persistence/supabase/account_repository.py` confirms fix #1, `! grep -n 'ilike' <API>/app/infrastructure/persistence/supabase/account_repository.py | grep -i email` confirms fix #2 (no email ilike).

- [ ] 9. Create the email delivery adapters and template. `app/infrastructure/delivery/resend_email_sender.py` — `ResendEmailSender(api_key, email_from)` doing `POST https://api.resend.com/emails` with `Authorization: Bearer <key>` and JSON `{from, to:[to], subject, html}` via `httpx.AsyncClient(timeout=10.0)`; raise `PermanentDeliveryError(detail=..., channel="email", reason="rejected")` on `httpx.HTTPError` or `resp.status_code >= 400`; log at warning without the body/token. `app/infrastructure/delivery/log_email_sender.py` — `LogEmailSender` whose `send` logs only `subject` (never body/token), mirroring `log_channel.py`. `app/infrastructure/delivery/templates/__init__.py` (empty) and `app/infrastructure/delivery/templates/password_reset_email.py` — `password_reset_html(reset_link, ttl_minutos) -> str` (editable Spanish HTML with Qhub branding, a button to `reset_link`, expiry note) and `PASSWORD_RESET_SUBJECT = "Recupera tu contraseña de Qhub"`.
      Files: `<API>/app/infrastructure/delivery/resend_email_sender.py`, `<API>/app/infrastructure/delivery/log_email_sender.py`, `<API>/app/infrastructure/delivery/templates/__init__.py`, `<API>/app/infrastructure/delivery/templates/password_reset_email.py`
      Verify: `python3 -c "from app.infrastructure.delivery.templates.password_reset_email import password_reset_html, PASSWORD_RESET_SUBJECT; h=password_reset_html('http://x/qhub/restablecer?token=abc', 60); assert 'abc' in h and PASSWORD_RESET_SUBJECT"` from `<API>` exits 0 (pure-Python, no deps). `ResendEmailSender` import requires `httpx` — covered by step 16 or run inside the API image.

- [ ] 10. Extend `AuthUseCases` in `app/application/use_cases/auth.py`: add `emails: EmailSender`, `reset_url: str`, `reset_ttl_minutos: int` as the **last three** `__init__` params (store on `self`). Add imports (`secrets`, `timedelta`, `ApplicationError`, `RequestPasswordReset`, `ResetPassword`, `EmailJob`, `password_reset_html`, `PASSWORD_RESET_SUBJECT`). Add the three methods exactly as design.md:
      - `request_password_reset(command) -> EmailJob | None`: normalize email (`strip().lower()`); if `find_reset_target` is `None`, call `await self._burn_verification("reset")` (neutral literal, **fix-aligned**) and return `None`; else build `raw_token = secrets.token_urlsafe(32)`, `token_hash = self._api_keys.digest(raw_token)`, `expira_en = self._clock.now_utc() + timedelta(minutes=self._reset_ttl_minutos)`, call `create_password_reset`, build `link = f"{self._reset_url.rstrip('/')}/qhub/restablecer?token={raw_token}"`, return `EmailJob(to=target.email, subject=PASSWORD_RESET_SUBJECT, html=password_reset_html(link, self._reset_ttl_minutos))`. **Does not send** — the router enqueues it.
      - `send_reset_email(job)`: `try: await self._emails.send(...) except ApplicationError: pass`.
      - `reset_password(command)`: `token_hash = self._api_keys.digest(command.token)`; `now = self._clock.now_utc()`; `record = await find_valid_reset(...)`; if `None` → `raise Unauthorized("El enlace no es válido o ya expiró", "invalid")`; else `new_hash = await self._passwords.hash_password(command.new_password)`; `update_password_hash(record.owner, record.account_id, new_hash)`; `mark_reset_used(record.id, now)`; `invalidate_resets_for_account(record.owner, record.account_id, now)`.
      Files: `<API>/app/application/use_cases/auth.py`
      Verify: covered by step 15's self-running unit test; smoke check `python3 -c "import ast; ast.parse(open('<API>/app/application/use_cases/auth.py').read())"` exits 0.

- [ ] 11. Add the Pydantic schemas to `app/api/schemas/auth.py`: `RecuperarCrear(email: EmailStr)`, `RestablecerCrear(token: str = Field(min_length=1), password: str = Field(min_length=8, max_length=72))` (**fix #5:** `max_length=72` aligns with `validatePassword` and bcrypt), `MensajeOut(detail: str)`.
      Files: `<API>/app/api/schemas/auth.py`
      Verify: `python3 -c "from app.api.schemas.auth import RecuperarCrear, RestablecerCrear, MensajeOut; f=RestablecerCrear.model_fields['password']; assert f.metadata"` from `<API>` exits 0 (pydantic runtime dep; run in API image if absent on host). Also assert the 72 cap is present in the field definition by inspecting the source.

- [ ] 12. Add the two endpoints to `app/api/routers/auth.py`. Widen imports to `from fastapi import APIRouter, Depends, Header, BackgroundTasks`; import `RecuperarCrear, RestablecerCrear, MensajeOut` from `app.api.schemas.auth` and `RequestPasswordReset, ResetPassword` from `app.domain.models`. `POST /recuperar(datos, background, casos)`: call `request_password_reset`, wrap `ApplicationError` → `http_error`; if `job is not None`, `background.add_task(casos.send_reset_email, job)`; always return `MensajeOut(detail="Si el correo está registrado, te enviamos un enlace para restablecer la contraseña.")` (same body regardless of existence — anti-enumeration). `POST /restablecer(datos, casos)`: call `reset_password`, wrap `ApplicationError` → `http_error`, return `MensajeOut(detail="Tu contraseña se actualizó. Ya puedes iniciar sesión con la nueva.")`.
      Files: `<API>/app/api/routers/auth.py`
      Verify: `python3 -c "import ast,sys; t=ast.parse(open('<API>/app/api/routers/auth.py').read()); src=open('<API>/app/api/routers/auth.py').read(); assert '/recuperar' in src and '/restablecer' in src and 'BackgroundTasks' in src"` from `<API>` exits 0; full wiring is exercised in step 16 (integration test) when deps are present.

- [ ] 13. Wire the email sender in `app/dependencies/Dependencies.py`: add imports for `ResendEmailSender`/`LogEmailSender`; add two Factory providers (`resend_email_sender` with `settings.provided.RESEND_API_KEY, settings.provided.EMAIL_FROM`; `log_email_sender`); in `build_container`, after `settings` is overridden and before resolving `auth`, select `email_sender = container.resend_email_sender() if settings.RESEND_API_KEY.strip() else container.log_email_sender()`; change the `auth = container.auth()` call to `auth = container.auth(email_sender, settings.PASSWORD_RESET_URL, settings.PASSWORD_RESET_TTL_MINUTOS)`. Keep the declarative `auth` provider and `RuntimeContainer(..., auth=auth, ...)` unchanged.
      Files: `<API>/app/dependencies/Dependencies.py`
      Verify: build/resolution is exercised by step 16's integration test (needs `dependency_injector`); smoke check `python3 -c "import ast; ast.parse(open('<API>/app/dependencies/Dependencies.py').read())"` exits 0 and `grep -q 'container.auth(' <API>/app/dependencies/Dependencies.py` confirms the extended call.

- [ ] 14. Codebase still imports/parses cleanly after the API source changes. Run an import smoke test of the touched modules that have no heavy external deps, and (if runtime deps are available on host or via the API image) import the app wiring.
      Files: none (verification only)
      Verify: from `<API>`, `python3 -c "import ast,glob; [ast.parse(open(f).read()) for f in ['app/application/use_cases/auth.py','app/infrastructure/persistence/supabase/account_repository.py','app/api/routers/auth.py','app/dependencies/Dependencies.py','app/config/config.py','app/domain/models.py','app/domain/value_objects.py','app/domain/interfaces/accounts.py','app/domain/interfaces/email.py','app/infrastructure/delivery/resend_email_sender.py','app/infrastructure/delivery/log_email_sender.py','app/infrastructure/delivery/templates/password_reset_email.py']]"` exits 0.

- [ ] 15. **NEW TEST FILE** `tests/test_password_reset.py` — self-running (same pattern as `test_turn_ownership.py`: `asyncio.run`, hand-written in-memory fakes, `if __name__ == "__main__"` loop that calls every `test_*`). Build a fake `AccountRepository` (in-memory dict of login rows for one empresa with **two subaccounts** sharing `empresa_id` but distinct `id`/`email`, plus one usuario, and a `password_resets` dict), a fake `EmailSender` recording calls (and a variant that raises `PermanentDeliveryError`), a fixed `Clock`, and the **real** `ApiKeyCodec`. Cover exactly these cases (the design's required verification matrix):
      - **success path:** existing email → `request_password_reset` returns an `EmailJob` whose `html` contains the raw token in the link, a `password_resets` row is created anchored on the row's real PK (`account_id`), and nothing was sent yet.
      - **unknown-email anti-enumeration:** returns `None`, creates nothing, `_burn_verification` was spent (same observable response path).
      - **send:** `send_reset_email(job)` calls the fake sender exactly once; with the raising fake, `send_reset_email` swallows the error (does not propagate).
      - **two-subaccount isolation:** resetting one empresa subaccount anchors to its PK; the UPDATE and invalidation touch only that `account_id` (fixes #1/#2/#5/#6 behavior).
      - **expired token:** `find_valid_reset` returns `None` for an expired row → `reset_password` raises `Unauthorized` (401 reason "invalid").
      - **already-used token:** a row with `usado_en` set → `find_valid_reset` returns `None` → `reset_password` raises `Unauthorized`; a second `reset_password` with the same token stays 401 (idempotence).
      - **enum round-trip (fix #7):** assert `PropietarioTipo("empresa").value == "empresa"` and `PropietarioTipo("usuario").value == "usuario"` and that `PropietarioTipo(stored_value)` reconstructs the right owner type for the reset lookup.
      Files: `<API>/tests/test_password_reset.py`
      Verify: from `<API>`, `python3 -m tests.test_password_reset` prints `ok <name>` for every test and exits 0. If imports fail on host for a missing runtime dep (e.g. `bcrypt` via the real `PasswordHasher`), use a fake `PasswordHasher` in the test so the module stays host-runnable; only fall back to the API image if `ApiKeyCodec`/`hashlib` import still fails.

- [ ] 16. **NEW TEST FILE** `tests/test_password_reset_endpoints.py` — self-running integration-style test for the two endpoints using FastAPI `TestClient` and a `Dependencies`/container override that injects the in-memory fake `AccountRepository` and `LogEmailSender` (so it runs without `RESEND_API_KEY` or a real DB). Assert: `POST /auth/recuperar` returns **200 with the exact generic body** for both an existing and a non-existing email (identical status + body — anti-enumeration); `POST /auth/restablecer` with a valid token returns 200 and the success body; with an invalid/expired token returns 401. Also add one `ResendEmailSender` case using `httpx.MockTransport` for a 200 (ok, no raise) and a 4xx (raises `PermanentDeliveryError`) without real network.
      Files: `<API>/tests/test_password_reset_endpoints.py`
      Verify: from `<API>`, `python3 -m tests.test_password_reset_endpoints` prints `ok <name>` for every test and exits 0. This file needs `fastapi`/`httpx`/`dependency_injector`; if they are not on the host, run it inside the API image: `docker run --rm -v "<API>":/app -w /app python:3.12-slim bash -lc 'pip install --no-cache-dir -r requirements.lock.txt >/dev/null && python -m tests.test_password_reset_endpoints'`. State in the final summary which path was used.

- [ ] 17. Confirm the **pre-existing** API test still passes (no regression from the shared `AuthUseCases`/`account_repository`/`Dependencies` edits).
      Files: none (verification only)
      Verify: from `<API>`, `python3 -m tests.test_turn_ownership` prints `ok` for each test and exits 0 (host-runnable; it uses only stdlib + app domain).

---

# Phase B — Web (`<WEB>`)

- [ ] 18. Add the two methods to the `AuthRepository` interface in `packages/api-client/src/domain/repositories.ts`: `requestPasswordReset(email: string): Promise<Result<void>>` (doc: `POST /auth/recuperar`, same response whether or not the email exists) and `resetPassword(token: string, newPassword: string): Promise<Result<void>>` (doc: `POST /auth/restablecer`).
      Files: `<WEB>/packages/api-client/src/domain/repositories.ts`
      Verify: `npm run typecheck` from `<WEB>` — expected to FAIL only in `fakes.ts` and `auth.ts` until steps 19–20 land (the interface now has unimplemented members). This is the dependency anchor; do not treat the transient failure as done — proceed to 19–20 and re-run.

- [ ] 19. Implement the two methods in `packages/api-client/src/data/repositories/auth.ts` following the `login`/`register` style (`guard(async () => { await call(this.t, { method:'POST', path:'/auth/recuperar', body:{ email } }); }, mapError)` and `.../auth/restablecer` with `body:{ token, password: newPassword }`). `call` accepts 200/201/204 and `/auth/*` is public.
      Files: `<WEB>/packages/api-client/src/data/repositories/auth.ts`
      Verify: part of step 25's typecheck; `grep -q "/auth/recuperar" <WEB>/packages/api-client/src/data/repositories/auth.ts && grep -q "/auth/restablecer" <WEB>/packages/api-client/src/data/repositories/auth.ts` exits 0.

- [ ] 20. Add the two controllable methods to `FakeAuthRepository` in `apps/web/src/testing/fakes.ts` (so the interface still compiles). Add fields `resetRequests: string[] = []`, `resets: Array<{ token: string; password: string }> = []`, `requestResetFailure: Failure | null = null`, `resetFailure: Failure | null = null`; implement `requestPasswordReset(email)` (push email, return `err(requestResetFailure)` or `ok(undefined)`) and `resetPassword(token, password)` (push `{token,password}`, return `err(resetFailure)` or `ok(undefined)`). `Failure`/`ok`/`err` are already imported. Do **NOT** touch `FakeSecurity.requestPasswordReset` (different repo).
      Files: `<WEB>/apps/web/src/testing/fakes.ts`
      Verify: part of step 25's typecheck; `grep -q "resetRequests" <WEB>/apps/web/src/testing/fakes.ts` exits 0.

- [ ] 21. **Fix #4** — update `CredentialsDialog.tsx`. Add `onForgot?: () => void; onRegister?: () => void;` to the EXISTING destructured prop signature `{ title, intro, confirmLabel, rememberLabel, onSubmit, onCancel }` and its inline type. **REPLACE** the exact line `{err && <Notice kind="error" title={err} />}` with a single `Notice` that adds `action={...}` containing the two help links (only rendered when the respective callback is present): `¿Olvidaste tu contraseña?` → `onForgot()` and `¿No tienes cuenta? Regístrate en Qhub` → `onRegister()`, each as an `<a href="#" onClick={e => { e.preventDefault(); cb(); }}>`. Do NOT add a second `Notice`. Links appear only when `err` is set and the callback was passed; when callers omit both, behavior is identical to today.
      Files: `<WEB>/apps/web/src/features/qhub/CredentialsDialog.tsx`
      Verify: part of step 25's typecheck + step 26's vitest; `grep -c "Notice kind=\"error\"" <WEB>/apps/web/src/features/qhub/CredentialsDialog.tsx` prints `1` (single error Notice) and `grep -q "onForgot" <WEB>/apps/web/src/features/qhub/CredentialsDialog.tsx` exits 0.

- [ ] 22. Wire `onForgot`/`onRegister` from the two mount points using `useNavigate`. In `apps/web/src/features/qhub/ReconnectBanner.tsx` and `apps/web/src/features/settings/SettingsPage.tsx`, pass `onForgot={() => navigate('/qhub/recuperar')}` and `onRegister={() => navigate('/connect')}` to `<CredentialsDialog ... />` (import `useNavigate` from `react-router-dom`; add the hook call in each component). `/connect` is the `ConnectPage` registration route (its tab index 1 is "Crear cuenta"; jumping straight to that tab is out of minimal scope). Keep callbacks optional so nothing else changes.
      Files: `<WEB>/apps/web/src/features/qhub/ReconnectBanner.tsx`, `<WEB>/apps/web/src/features/settings/SettingsPage.tsx`
      Verify: part of step 25's typecheck + step 26's vitest; `grep -q "/qhub/recuperar" <WEB>/apps/web/src/features/qhub/ReconnectBanner.tsx` exits 0.

- [ ] 23. Create the two new screens under `apps/web/src/features/qhub/`. Both use `useContainer().auth` and do NOT depend on `useSession()` (recipient is anonymous). Reuse `Panel`, `Logo`, `Notice`, `TextField`/`EmailField`, `Button`, `StrengthMeter`, `GeneratePassword` like `ResetPasswordPage.tsx`/`ConnectPage`.
      - `QhubRequestResetPage.tsx`: email field; validate with `validateEmail` from `@qhub/core` before calling; call `auth.requestPasswordReset(email)`. After responding, ALWAYS show the neutral message "Si el correo está registrado en Qhub, te enviamos un enlace para elegir una contraseña nueva. Revisa también el spam." (never reveal existence). On network/server failure show `Notice kind="error"` with `failure.message`.
      - `QhubResetPasswordPage.tsx`: read `?token=` via `useSearchParams`. New password + confirm. **Fix #5:** on submit, before calling the API, if `pw !== pw2` show "Las contraseñas no coinciden."; call `validatePassword(pw)` **WITHOUT** the `{ email }` option (anonymous user, no known email); show format errors inline without calling the API; the 72-char cap matches `validatePassword` and the API `max_length=72`. On valid input call `auth.resetPassword(token, pw)`. On success, **stay on the page** (do NOT navigate to `/connect`) and replace the form with `Notice kind="success"` ("Tu contraseña se actualizó. Ya puedes iniciar sesión con la nueva.") plus an `action` link "Inicia sesión en el panel" → `/login`. On failure (401 → `unauthorizedFailure`) show a Spanish `Notice kind="error"` with a link to `/qhub/recuperar`; if no `token` in the URL, show that same error.
      Files: `<WEB>/apps/web/src/features/qhub/QhubRequestResetPage.tsx`, `<WEB>/apps/web/src/features/qhub/QhubResetPasswordPage.tsx`
      Verify: part of step 25's typecheck + step 27's new screen tests.

- [ ] 24. Register the routes and make them public. In `apps/web/src/app/AppRoutes.tsx`, add two `lazy` imports and two routes inside `<Route element={<Gate />}>`: `/qhub/recuperar` → `QhubRequestResetPage`, `/qhub/restablecer` → `QhubResetPasswordPage`. In `apps/web/src/app/resolve-redirect.ts`, **Fix #3:** at the very START of `resolveRedirect` (BEFORE the `authLoading`/`!signedIn` guard), return `null` for the two public reset paths, handling the query string on `/qhub/restablecer`. Use `const path = here.split('?')[0]` (or a `startsWith('/qhub/restablecer')` prefix test) so the email link `/qhub/restablecer?token=...` matches: `if (path === '/qhub/recuperar' || path === '/qhub/restablecer') return null;`. (`o.location` is pathname-only in the current `Gate`, but normalizing is the safe, review-mandated form.)
      Files: `<WEB>/apps/web/src/app/AppRoutes.tsx`, `<WEB>/apps/web/src/app/resolve-redirect.ts`
      Verify: part of step 25's typecheck + step 26/27 tests; `grep -q "/qhub/restablecer" <WEB>/apps/web/src/app/resolve-redirect.ts` exits 0.

- [ ] 25. Web typechecks clean across all workspaces after steps 18–24.
      Files: none (verification only)
      Verify: `npm run typecheck` from `<WEB>` (or the README Docker form) — 0 errors.

- [ ] 26. Confirm the existing suite still passes, especially `apps/web/src/app/auth-and-roles.test.tsx` (the Reconnect "Credenciales inválidas" path). The help links are optional/opt-in so the dialog still renders the single error Notice as before; the new `resolve-redirect` early-return must not alter any existing redirect (it only adds `/qhub/*`). Add a test for the help links: `apps/web/src/features/qhub/CredentialsDialog.test.tsx` rendering the dialog with an error and `onForgot`/`onRegister` spies, asserting both links appear only on error and fire the callbacks.
      Files: `<WEB>/apps/web/src/features/qhub/CredentialsDialog.test.tsx` (**NEW TEST FILE**)
      Verify: `npm run test` from `<WEB>` — all suites green, including `auth-and-roles.test.tsx` and the new `CredentialsDialog.test.tsx`.

- [ ] 27. Add tests for the two new screens and the repository methods. `apps/web/src/features/qhub/QhubRequestResetPage.test.tsx`: with `FakeAuthRepository`, submitting a valid email shows the neutral message and records the request; invalid email shows the inline format error without calling the API. `apps/web/src/features/qhub/QhubResetPasswordPage.test.tsx`: token-valid path shows the `Notice kind="success"` with the "Inicia sesión en el panel" link (→ `/login`) and does NOT navigate to `/connect`; mismatched passwords show "Las contraseñas no coinciden." without calling the API; token-invalid (`resetFailure = unauthorizedFailure(...)`) shows the error + `/qhub/recuperar` link; missing token shows the same error. `packages/api-client/src/data/repositories/auth.test.ts` (or the package's existing test style): `requestPasswordReset`/`resetPassword` hit the right method, path, and body using a fake `HttpTransport`.
      Files: `<WEB>/apps/web/src/features/qhub/QhubRequestResetPage.test.tsx` (**NEW**), `<WEB>/apps/web/src/features/qhub/QhubResetPasswordPage.test.tsx` (**NEW**), `<WEB>/packages/api-client/src/data/repositories/auth.test.ts` (**NEW** — confirm the package's test harness/location first; if the api-client package has no vitest setup, place the transport assertion inside the web app's test that already has one, and note it).
      Verify: `npm run test` from `<WEB>` — all suites green.

---

# Verification matrix (summary)

- **API unit** (`tests/test_password_reset.py`, self-running): success path, unknown-email anti-enumeration, send-once + swallow on delivery error, two-subaccount isolation, expired token, already-used token (+ idempotence), enum round-trip. Run: `python3 -m tests.test_password_reset`.
- **API integration** (`tests/test_password_reset_endpoints.py`, self-running + TestClient): `/auth/recuperar` identical 200 body for existing vs non-existing email; `/auth/restablecer` 200 valid / 401 invalid-or-expired; `ResendEmailSender` 200 ok vs 4xx raises, via `httpx.MockTransport`. Run: `python3 -m tests.test_password_reset_endpoints` (API image if host lacks deps).
- **API regression:** `python3 -m tests.test_turn_ownership`.
- **Web:** `npm run typecheck` (0 errors) and `npm run test` (all green), keeping `apps/web/src/app/auth-and-roles.test.tsx` passing; new tests for the help links and both new screens; `FakeAuthRepository` gains `requestPasswordReset`/`resetPassword`.

# NEW TEST FILES (enumerated so they can be deleted later)

- `<API>/tests/test_password_reset.py`
- `<API>/tests/test_password_reset_endpoints.py`
- `<WEB>/apps/web/src/features/qhub/CredentialsDialog.test.tsx`
- `<WEB>/apps/web/src/features/qhub/QhubRequestResetPage.test.tsx`
- `<WEB>/apps/web/src/features/qhub/QhubResetPasswordPage.test.tsx`
- `<WEB>/packages/api-client/src/data/repositories/auth.test.ts` (only if the api-client package has/accepts a vitest setup; otherwise folded into an existing web test and noted)

# Manual step required before the feature works (state in the final summary)

`<API>/sql/001_password_resets.sql` must be applied **by hand in the Supabase SQL editor** before the feature works — the API repo has no migration mechanism; its existing tables and RPCs also live only in Supabase. Choose the enum column or the `text + check` fallback variant per the target instance.

# Assumptions / gaps noted

- The Resend HTTP URL/body shape (`https://api.resend.com/emails`, `{from,to,subject,html}`, `Authorization: Bearer`) is an external contract not verifiable from the repo; the implementer should confirm against Resend's current docs while implementing step 9. It does not block the LogEmailSender fallback path or any test (tests use `httpx.MockTransport`).
- If the api-client package lacks a vitest runner, the transport-level assertion for `requestPasswordReset`/`resetPassword` is folded into an existing web test harness rather than adding tooling; flagged in step 27.

# VERIFICATION RESULT (first iteration)

See `verification.md` for the full evidence. Summary: API unit 9/9 (host) + endpoints 5/5 and
regression 4/4 (inside the API Docker image), config settings OK; Web `npm run typecheck` 0
errors and `npm run test` 241/241 green (incl. `auth-and-roles.test.tsx`), api-client 52/52.
Per the user's explicit request to leave the repo clean, the NEW test files listed above were
then deleted; typecheck was re-confirmed green afterward. The Supabase DDL
`sql/001_password_resets.sql` is still a required manual step.
