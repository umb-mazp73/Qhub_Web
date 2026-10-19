# Diseño técnico — "Olvidé / restablecer contraseña" (Qhub API + Qhub Web)

## Resumen

Implementa un flujo completo de recuperación y restablecimiento de contraseña para las
**cuentas de la API de Qhub** (las credenciales que se escriben en `CredentialsDialog` /
`ConnectPage` para "Reconectar con Qhub"). La API de Qhub tiene su propio sistema de
contraseñas (`password_hash` en `control_empresas` para empresas y `usuarios` para
usuarios), no usa Supabase Auth; por eso el reset se construye manualmente y no puede
reutilizar el reset nativo de Supabase.

El flujo abarca dos repositorios editados en el sitio (sin worktree):

- **API** (`/home/miguelzambrano/projects/Qhub/qhub-api`, Python 3 / FastAPI): dos
  endpoints nuevos (`POST /auth/recuperar`, `POST /auth/restablecer`), una tabla nueva
  `password_resets`, un integrador de correo (Resend por HTTP), plantilla de correo en
  archivo propio, y config nueva.
- **Web** (`/home/miguelzambrano/projects/Qhub_Web`, TypeScript / React / Vite): dos
  métodos nuevos en `AuthRepository`, dos pantallas nuevas (pedir enlace y elegir
  contraseña nueva), enlaces de ayuda en `CredentialsDialog`, y el doble de prueba
  actualizado.

Stack bloqueado: Python/FastAPI + `dependency-injector` + `supabase` (AsyncClient) +
`httpx` + `bcrypt` en la API; TypeScript + React + React Router + Vite + el patrón
Result/Failure de `@qhub/core` en la web. No se agregan dependencias nuevas: `httpx` y
`secrets`/`hashlib` ya están disponibles.

---

## Decisión clave 1 — Mecanismo de migraciones (ambigüedad resuelta)

**Hallazgo (verificado en el repo de la API).** El repo **no tiene ningún mecanismo de
migraciones**. Comprobado directamente:

- No existen carpetas `supabase/`, `migrations/`, `db/`, `sql/` ni `alembic/`
  (`find -type d` solo devolvió `app/infrastructure/persistence/supabase`).
- No existe ningún archivo `.sql` en el repo (`find . -name '*.sql'` vacío).
- No existe `alembic.ini` ni ninguna cadena `CREATE TABLE` / `create or replace function`
  en el código Python.
- Los RPC `registrar_usuario` y `registrar_empresa` solo se **invocan** desde
  `account_repository.py` (`self._client.rpc("registrar_usuario", …)` /
  `self._client.rpc("registrar_empresa", …)` dentro de `register()`); su definición vive
  únicamente en la instancia de Supabase.
- El enum `PropietarioTipo` (`app/domain/enums.py`) cita `schema.sql` en un docstring
  (`"enum propietario_tipo en schema.sql"`), pero **ese archivo no está versionado** en el
  repo. Los valores del enum son exactamente `EMPRESA = "empresa"` y
  `USUARIO = "usuario"` (verificado).

**Resolución.** No se introduce una herramienta de migraciones (Alembic u otra): sería un
cambio de stack mayor para una sola tabla, incoherente con cómo el proyecto ya gestiona su
esquema. En su lugar se crea una carpeta nueva `sql/` en la raíz del repo de la API con un
único archivo DDL versionado como **documentación + script de aplicación manual**. El DDL
**debe aplicarse a mano en el SQL Editor de Supabase antes de desplegar la API** — igual
que ya ocurre con las tablas y RPC existentes, que viven solo en Supabase y no están
versionados. Esto es un **paso manual obligatorio** y se anotará explícitamente en el
resumen final de la tarea y como comentario de cabecera del propio `.sql`.

No se usa un RPC para el reset: la escritura es un `UPDATE` de una sola columna sobre una
fila ya identificada (no hay atomicidad multi-tabla como en el registro, que sí usa RPC
para crear empresa + fila de control en una transacción). Se resuelve con
`.table(...).update(...)` espejando el estilo de `find_login()` / `register()`.

Archivo nuevo: **`/home/miguelzambrano/projects/Qhub/qhub-api/sql/001_password_resets.sql`**

---

## Decisión clave 2 — Esquema de `password_resets` y actualización de `password_hash` (ambigüedad resuelta)

**Hallazgo del esquema existente** (confirmado leyendo `account_repository.py` y
`value_objects.py`, no asumido):

- **Empresas.** La fila de login vive en `control_empresas`. Columnas usadas por el
  código actual: `empresa_id`, `nombre`, `apellido`, `nombre_usuario`, `email`,
  `password_hash`, `pais`, `ciudad`, `acepto_terminos`, `acepto_terminos_en`, `activa`.
  El `OwnerId` de una empresa es `(EMPRESA, UUID(empresa_id))` — así lo construye
  `find_login()`: `OwnerId(EMPRESA, UUID(row["empresa_id"]))`.
  **Punto crítico (verificado en `register()`):** al registrar una *subcuenta* de una
  empresa existente, el código inserta en `control_empresas` con
  `"empresa_id": str(draft.owner.id)` reutilizando el mismo `empresa_id`. Por tanto
  **pueden coexistir varias filas de `control_empresas` con el mismo `empresa_id`** (una
  por persona que administra la empresa), cada una con su propio `email` / `nombre_usuario`
  / `password_hash`. En consecuencia `empresa_id` **no** identifica unívocamente la fila de
  login; el `email` (normalizado) sí la identifica (es el identificador de login, único por
  cuenta, igual que `nombre_usuario`).
- **Usuarios.** La fila vive en `usuarios`, identificada por `id`. `find_login()` devuelve
  `OwnerId(USUARIO, UUID(row["id"]))`, es decir el `OwnerId.id` de un usuario **es** su
  `usuarios.id` (un usuario es dueño de sí mismo). Columnas relevantes: `id`,
  `nombre_usuario`, `email`, `password_hash`, `activa`.

**Resolución — identificación de la fila por PK real y actualización de `password_hash`
(corrige los hallazgos de revisión MEDIUM #5 y #6, de forma coherente).** Dado el punto
crítico anterior, el reset de una cuenta de empresa **no** puede anclarse ni en
`empresa_id` (agrupa a todas las subcuentas) ni **solo** en `email` (un UPDATE por `email`
sin `limit` ni verificación de filas afectadas sobrescribiría credenciales ajenas si
hubiera datos sucios). La decisión es **anclar todo — UPDATE del hash, fila de
`password_resets` e invalidación — en la PK REAL de la fila de login**, leída en
`find_reset_target`:

- Empresa: la PK real es **`control_empresas.id`** (columna propia de la fila, distinta de
  `empresa_id`; verificado: `identifier_exists` hace `.select("id")` sobre
  `control_empresas`). Se expone como `ResetTarget.account_id`.
- Usuario: la PK real es **`usuarios.id`**, que además coincide con `OwnerId(USUARIO).id`
  (un usuario es dueño de sí mismo). También se expone como `ResetTarget.account_id`.

Así, `password_resets` guarda `propietario_tipo` + `propietario_id` (el id "de dueño", para
diagnóstico/agrupación), **`account_id`** (la PK real de la fila de login, clave de
anclaje) y **`email`** (normalizado, solo informativo/para el correo y como respaldo
legible). Todas las escrituras sensibles se anclan a `account_id`, no a `email`.

Reglas exactas del UPDATE por tipo (por PK real, siempre **exactamente una** fila):

- `EMPRESA` → `table("control_empresas").update({"password_hash": …}).eq("id", str(account_id))`.
  La PK `control_empresas.id` identifica unívocamente la fila de login aunque varias
  subcuentas compartan `empresa_id`. **No** se usa `.ilike("email", …)` (eso era el riesgo
  del doble UPDATE del hallazgo #5).
- `USUARIO` → `table("usuarios").update({"password_hash": …}).eq("id", str(account_id))`.
  `account_id == usuarios.id`; PK estable y única.

Como salvaguarda adicional (defensa en profundidad del hallazgo #5), tras cada UPDATE el
repo verifica que `result.data` tenga **exactamente una** fila afectada; si afectara 0
(fila borrada en carrera) o >1 (dato corrupto, no debería ocurrir con filtro por PK), se
levanta `PersistenceFailure(operation="update_password_hash")` y se registra a nivel error,
en vez de confiar ciegamente en la unicidad.

**Nota de integridad.** El `email` de login se asume único por cuenta (coherente con
`identifier_exists`, que trata `email`/`nombre_usuario` como identificadores y rechaza
duplicados en el registro), pero esa suposición ya **no** sostiene ninguna operación de
escritura: el anclaje por PK real la vuelve irrelevante para la seguridad del UPDATE. La
invalidación (`invalidate_resets_for_account`) también filtra por `account_id`, de modo que
cambiar la contraseña de **una** cuenta invalida solo **sus** enlaces pendientes, no los de
las demás subcuentas de la misma empresa (resolviendo la incoherencia de granularidad del
hallazgo #6).

**Esquema de la tabla `password_resets`** (DDL exacto, en el archivo de migración):

```sql
-- /home/miguelzambrano/projects/Qhub/qhub-api/sql/001_password_resets.sql
-- Aplicar manualmente en Supabase (SQL Editor). El proyecto no versiona el esquema;
-- las tablas y los RPC (registrar_usuario / registrar_empresa) ya viven solo en Supabase.

create table if not exists public.password_resets (
    id              uuid primary key default gen_random_uuid(),
    propietario_tipo propietario_tipo not null,   -- enum existente: 'empresa' | 'usuario'
    propietario_id  uuid not null,                 -- id "de dueño" (empresa_id | usuarios.id); diagnóstico/agrupación
    account_id      uuid not null,                 -- PK REAL de la fila de login: control_empresas.id | usuarios.id
    token_hash      text not null unique,          -- SHA-256 hex del token crudo; nunca se guarda el crudo
    email           text not null,                 -- email (normalizado) de la fila de login; informativo
    expira_en       timestamptz not null,
    usado_en        timestamptz,                   -- null = sin usar
    creada_en       timestamptz not null default now()
);

create index if not exists password_resets_token_hash_idx on public.password_resets (token_hash);
create index if not exists password_resets_account_idx on public.password_resets (propietario_tipo, account_id);
```

**Dependencia del enum `propietario_tipo`.** El enum existe en la instancia de Supabase
(el código Python lo mapea 1:1 con `PropietarioTipo.value` → `'empresa'` / `'usuario'`,
y `find_owner_by_api_key_digest` ya lee una columna `propietario_tipo` de la tabla
`api_keys`), pero su DDL no está en el repo, así que no se pudo inspeccionar su definición
exacta. El archivo `001_password_resets.sql` **declara la columna como el enum**
(`propietario_tipo not null`) por defecto, y deja **comentada** una variante de respaldo
para instancias donde el tipo no estuviera creado:

```sql
-- Variante de respaldo si el tipo enum 'propietario_tipo' no existiera en esta instancia:
-- propietario_tipo text not null check (propietario_tipo in ('empresa','usuario')),
```

Quien aplique el script elige una de las dos líneas según su instancia. En cualquier caso
los valores escritos por la app son siempre `'empresa'` / `'usuario'` (el `.value` del
enum), compatibles con ambas variantes.

---

## API — archivos y cambios

### Config — `app/config/config.py` y `.env`

Agregar a `class Settings` (siguiendo el estilo de campos + validadores existente):

```python
RESEND_API_KEY: str = ""
EMAIL_FROM: str = "onboarding@resend.dev"
PASSWORD_RESET_URL: str = "http://localhost:5173"
PASSWORD_RESET_TTL_MINUTOS: int = 60
```

Validador nuevo (espejando `_max_intentos_positivo`):

```python
@field_validator("PASSWORD_RESET_TTL_MINUTOS")
@classmethod
def _ttl_positivo(cls, value: int) -> int:
    if value < 1:
        raise ValueError("PASSWORD_RESET_TTL_MINUTOS debe ser mayor o igual a 1")
    return value
```

`.env` (`/home/miguelzambrano/projects/Qhub/qhub-api/.env`): **append** de claves nuevas
con comentarios, sin tocar ni imprimir los secretos existentes. `RESEND_API_KEY` ya está
presente (el usuario lo puso); se agregan solo las que falten:

```ini
# --- CORREO (recuperación de contraseña) ---
# Proveedor Resend por HTTP. Si RESEND_API_KEY queda vacío, el correo se escribe en el
# log (LogEmailSender) y el flujo igual funciona de punta a punta.
EMAIL_FROM=onboarding@resend.dev
# URL del front donde vive la pantalla de "elegir contraseña nueva". El enlace del correo
# apunta a {PASSWORD_RESET_URL}/qhub/restablecer?token=<token>
PASSWORD_RESET_URL=http://localhost:5173
# Minutos de validez del enlace de recuperación.
PASSWORD_RESET_TTL_MINUTOS=60
```

### Dominio — `app/domain/models.py`

Agregar dataclasses frozen (estilo `RegisterAccount`/`LoginCommand`):

```python
@dataclass(frozen=True, slots=True)
class RequestPasswordReset:
    email: str

@dataclass(frozen=True, slots=True)
class ResetPassword:
    token: str
    new_password: str
```

### Dominio — `app/domain/value_objects.py`

Modelo de la fila de reset y del "dueño a recuperar" (estilo `LoginRecord`):

```python
@dataclass(frozen=True, slots=True)
class ResetTarget:
    owner: OwnerId      # tipo + id "de dueño" (empresa_id para empresas, usuarios.id para usuarios)
    account_id: UUID    # PK REAL de la fila de login: control_empresas.id (empresa) | usuarios.id (usuario)
    email: str          # email (normalizado) de la fila de login

@dataclass(frozen=True, slots=True)
class PasswordResetRecord:
    id: UUID
    owner: OwnerId
    account_id: UUID    # PK real de la fila de login (igual que ResetTarget.account_id)
    email: str
    expira_en: datetime
    usado_en: datetime | None

@dataclass(frozen=True, slots=True)
class EmailJob:
    """Trabajo de correo diferido: lo devuelve request_password_reset y lo ejecuta el
    BackgroundTask del router vía AuthUseCases.send_reset_email, fuera del camino de la
    respuesta (ver nota anti-enumeración)."""
    to: str
    subject: str
    html: str
```

### Dominio — interfaz de correo nueva `app/domain/interfaces/email.py`

```python
from typing import Protocol

class EmailSender(Protocol):
    async def send(self, *, to: str, subject: str, html: str) -> None: ...
```

Contrato: éxito = retorno silencioso. Fallo de envío = levantar
`PermanentDeliveryError(channel="email", reason="rejected", detail=...)` (error ya
existente en `errors.py`) para fallos no recuperables (destino inválido, 4xx de Resend),
o `BrokerUnavailable`-equivalente para fallos transitorios; ver "Manejo de errores".

**Nota de diseño sobre `PermanentDeliveryError` (hallazgo de revisión NIT #7).**
`PermanentDeliveryError` **no** está en `STATUS_BY_TYPE` de
`app/api/core/error_handlers.py` (verificado; el mapeo a `HTTPException` lo hace
`http_error(error)` en `app/api/core/deps.py`: `HTTPException(STATUS_BY_TYPE.get(type(error),
500), error.detail)`)
y **no se añade**: por diseño este error **se consume íntegramente en la capa de
aplicación** (`AuthUseCases.send_reset_email`, dentro del `BackgroundTask`, lo captura como
`ApplicationError` y lo traga) y nunca escapa al handler global. El implementador no debe
asumir un status mapeado para él en este flujo. Como el envío corre en un `BackgroundTask`
posterior a la respuesta, aunque escapara no afectaría al cuerpo ya enviado al cliente.

### Dominio — interfaz de cuentas `app/domain/interfaces/accounts.py`

Agregar al `Protocol AccountRepository` (estilo existente):

```python
async def find_reset_target(self, email_norm: str) -> ResetTarget | None: ...
async def create_password_reset(
    self, target: ResetTarget, token_hash: str, expira_en: datetime
) -> None: ...
async def find_valid_reset(self, token_hash: str, now: datetime) -> PasswordResetRecord | None: ...
async def mark_reset_used(self, reset_id: UUID, used_at: datetime) -> None: ...
async def update_password_hash(self, owner: OwnerId, account_id: UUID, password_hash: str) -> None: ...
async def invalidate_resets_for_account(self, owner: OwnerId, account_id: UUID, now: datetime) -> None: ...
```

### Infra — `app/infrastructure/persistence/supabase/account_repository.py`

Implementar los métodos nuevos espejando `find_login()`:

- `find_reset_target(email_norm)`: itera exactamente la misma tupla que `find_login()`
  —`((PropietarioTipo.EMPRESA, "control_empresas", "empresa_id"), (PropietarioTipo.USUARIO,
  "usuarios", "id"))`— pero filtrando **solo por email** (no por `nombre_usuario`, porque
  el reset se pide con el correo) y seleccionando además la **PK real** de la fila:
  `table(table).select(f"id, {owner_column}, email").ilike("email", email_norm).limit(1)
  .execute()`. Si hay fila, devuelve
  `ResetTarget(owner=OwnerId(owner_type, UUID(str(row[owner_column]))),
  account_id=UUID(str(row["id"])), email=str(row["email"]))`. Nótese que para empresas
  `row[owner_column]` es `empresa_id` (va a `owner`) y `row["id"]` es la PK de la fila (va
  a `account_id`); para usuarios ambos son `usuarios.id` y coinciden. Si no hay fila, sigue
  a la tabla siguiente y al final devuelve `None`. **No** revela nada al llamador más allá
  de encontrado/no encontrado.
- `create_password_reset(target, token_hash, expira_en)`:
  `table("password_resets").insert({...}).execute()` con
  `propietario_tipo=target.owner.tipo.value`, `propietario_id=str(target.owner.id)`,
  `account_id=str(target.account_id)`, `token_hash`, `email=target.email`,
  `expira_en=expira_en.isoformat()`.
- `find_valid_reset(token_hash, now)`: `select("*").eq("token_hash", token_hash)
  .is_("usado_en", "null").gte("expira_en", now.isoformat()).limit(1)`. Mapea a
  `PasswordResetRecord(id, owner=OwnerId(PropietarioTipo(row["propietario_tipo"]),
  UUID(row["propietario_id"])), account_id=UUID(row["account_id"]), email, expira_en,
  usado_en)` o `None`.
- `mark_reset_used(reset_id, used_at)`: `table("password_resets").update({"usado_en":
  used_at.isoformat()}).eq("id", str(reset_id))`.
- `update_password_hash(owner, account_id, password_hash)`: tabla por tipo
  (`"control_empresas"` si `EMPRESA`, `"usuarios"` si `USUARIO`), **siempre** filtrando por
  la PK real: `table(tabla).update({"password_hash": password_hash}).eq("id",
  str(account_id)).execute()`. Tras ejecutar, **verificar `len(result.data) == 1`**; si es
  0 o >1, levantar `PersistenceFailure(operation="update_password_hash")` (defensa del
  hallazgo #5). No se usa `.ilike("email", …)`.
- `invalidate_resets_for_account(owner, account_id, now)`: `table("password_resets")
  .update({"usado_en": now.isoformat()}).eq("propietario_tipo", owner.tipo.value)
  .eq("account_id", str(account_id)).is_("usado_en", "null").execute()`. Filtra por
  `account_id` (no por `propietario_id`), así invalida solo los enlaces de **esa** cuenta.

**Errores de persistencia (corrige el hallazgo de revisión MEDIUM #1 — NO reutilizar
`map_registration_error`).** Un fallo a nivel de query del AsyncClient (postgrest/APIError
en `.select()`/`.insert()`/`.update()`) levanta una **excepción cruda, no un
`ApplicationError`** — solo `start()` y `require_client()` levantan `PersistenceUnavailable`.
Por tanto **cada** método nuevo del repo envuelve sus llamadas y traduce explícitamente.

**Decisión (verificada en `error_mapping.py`): NO se reutiliza `map_registration_error` en
estos métodos.** Ese mapeo tiene semántica de *registro de cuenta*, no de reset, y produce
mensajes y status incorrectos para este flujo:

- `23505` → `Conflict("El email o el nombre de usuario ya están registrados")` (409). Como
  `password_resets.token_hash` es `unique`, una colisión de hash en `create_password_reset`
  devolvería ese 409 sin sentido en `/auth/recuperar` — y **rompería la anti-enumeración**
  (un 409 en la rama "email existe" vs el 200 genérico es una señal observable).
- `23514` → `UnprocessableInput("Los datos de registro no son válidos")` (422), mensaje
  ajeno al reset.
- `QEMP1` → `NotFound("La empresa no existe")`, irrelevante aquí.
- default (cualquier otro código) → `PersistenceFailure(operation="register")`, que
  **oculta el método real** en los logs (p. ej. un fallo en `update_password_hash` se
  reportaría como `operation="register"`).

**Patrón exacto para los 6 métodos nuevos:** traducir **todo** fallo de query directamente a
`PersistenceFailure(operation="<nombre_del_metodo>")`, preservando el nombre real del
método (500 genérico, `detail` controlado):

```python
from app.application.errors import PersistenceFailure
try:
    result = await self._client.table(...)...execute()
except Exception as exc:
    raise PersistenceFailure(operation="<nombre_del_metodo>") from exc
```

No se importa `map_registration_error` en estos métodos. El `operation` identifica el
método real (`find_reset_target`, `create_password_reset`, `find_valid_reset`,
`mark_reset_used`, `update_password_hash`, `invalidate_resets_for_account`).

**Colisión de `token_hash` (`23505`), caso específico.** Es extremadamente improbable
(token de 256 bits de `secrets.token_urlsafe(32)`), pero si se quisiera blindar la rama
"email existe" contra una colisión de unicidad sin filtrar por status, se maneja **local y
explícitamente** en `create_password_reset` — no vía el mapeo de registro: reintentar con un
token nuevo. Snippet opcional:

```python
# create_password_reset: reintento acotado ante colisión de token_hash (unique)
for intento in range(2):
    raw_token = ...                      # el token/hash lo genera la capa de aplicación;
    try:                                 # si se centraliza el reintento aquí, el método
        result = await self._client.table("password_resets").insert({...}).execute()
        return
    except Exception as exc:
        if getattr(exc, "code", None) == "23505" and intento == 0:
            continue                     # colisión: reintentar una vez
        raise PersistenceFailure(operation="create_password_reset") from exc
```

Dado lo ínfimo de la probabilidad, el reintento es **opcional**; el comportamiento base
(traducir el `23505` a `PersistenceFailure(operation="create_password_reset")` → 500
genérico, mismo cuerpo que cualquier otro fallo de persistencia) ya preserva la
anti-enumeración (no es un 409 distinguible). Lo que **no** se hace es enrutar ese `23505`
por `map_registration_error`.

### Infra — correo `app/infrastructure/delivery/`

Dos adaptadores nuevos + una plantilla en archivo propio.

`app/infrastructure/delivery/resend_email_sender.py`:

```python
import logging
import httpx
from app.application.errors import PermanentDeliveryError

logger = logging.getLogger("qhub_api.delivery.email")

class ResendEmailSender:
    """POST a la API HTTP de Resend. Reutiliza httpx (ya es dependencia del proyecto)."""
    _URL = "https://api.resend.com/emails"   # confirmar URL/forma del body contra la doc oficial de Resend al implementar (servicio externo, no verificable desde el repo — hallazgo NIT #8)

    def __init__(self, api_key: str, email_from: str) -> None:
        self._api_key = api_key
        self._from = email_from

    async def send(self, *, to: str, subject: str, html: str) -> None:
        headers = {"Authorization": f"Bearer {self._api_key}", "Content-Type": "application/json"}
        body = {"from": self._from, "to": [to], "subject": subject, "html": html}
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(self._URL, json=body, headers=headers)
        except httpx.HTTPError as exc:
            # transitorio: el caso de uso ya respondió genérico; solo se registra
            logger.warning("No se pudo contactar a Resend")
            raise PermanentDeliveryError(detail="Fallo de red al enviar el correo", channel="email", reason="rejected") from exc
        if resp.status_code >= 400:
            logger.warning("Resend rechazó el envío (status=%s)", resp.status_code)
            raise PermanentDeliveryError(detail="El proveedor de correo rechazó el envío", channel="email", reason="rejected")
```

`app/infrastructure/delivery/log_email_sender.py` (espeja `log_channel.py`, no registra
el token ni el HTML):

```python
import logging
logger = logging.getLogger("qhub_api.delivery.email")

class LogEmailSender:
    """Fallback sin RESEND_API_KEY: deja constancia en el log (sin el cuerpo ni el token)."""
    async def send(self, *, to: str, subject: str, html: str) -> None:
        logger.info("Correo entregado (canal: log) asunto=%s", subject)
```

`app/infrastructure/delivery/templates/password_reset_email.py` — plantilla editable:

```python
def password_reset_html(reset_link: str, ttl_minutos: int) -> str:
    return f"""..."""  # HTML amistoso en español, marca Qhub, botón al reset_link,
                        # nota de expiración ({ttl_minutos} min). Archivo propio para editar libremente.
```

El asunto se define junto a la plantilla: `PASSWORD_RESET_SUBJECT = "Recupera tu contraseña de Qhub"`.

### Aplicación — `app/application/use_cases/auth.py`

Inyectar dependencias nuevas en `AuthUseCases.__init__` (siguiendo el orden actual, al
final): `emails: EmailSender`, `reset_url: str`, `reset_ttl_minutos: int`. Métodos nuevos:

```python
async def request_password_reset(self, command: RequestPasswordReset) -> EmailJob | None:
    """Anti-enumeración: misma respuesta genérica exista o no el email. El envío de correo
    se devuelve como "trabajo diferido" y NO se ejecuta aquí (ver nota anti-enumeración)."""
    email_norm = command.email.strip().lower()
    target = await self._accounts.find_reset_target(email_norm)
    if target is None:
        # Firma real: _burn_verification(self, password: str). El valor NO importa (solo se
        # usa para pagar un verify bcrypt contra el dummy hash); se pasa un literal neutro
        # para no sugerir que el email viaja a la verificación.
        await self._burn_verification("reset")             # gasta un verify bcrypt
        return None
    raw_token = secrets.token_urlsafe(32)
    token_hash = self._api_keys.digest(raw_token)          # SHA-256 hex, mismo codec que api keys
    expira_en = self._clock.now_utc() + timedelta(minutes=self._reset_ttl_minutos)
    await self._accounts.create_password_reset(target, token_hash, expira_en)
    link = f"{self._reset_url.rstrip('/')}/qhub/restablecer?token={raw_token}"
    # No se envía el correo en el camino de la respuesta: se devuelve el trabajo para que el
    # router lo encole en un BackgroundTask. Así /recuperar responde con costo similar exista
    # o no el email (el POST a Resend no entra en la latencia observable).
    return EmailJob(to=target.email, subject=PASSWORD_RESET_SUBJECT,
                    html=password_reset_html(link, self._reset_ttl_minutos))

async def send_reset_email(self, job: EmailJob) -> None:
    """Ejecutado por el BackgroundTask del router, fuera del camino de la respuesta."""
    try:
        await self._emails.send(to=job.to, subject=job.subject, html=job.html)
    except ApplicationError:
        # PermanentDeliveryError u otro: se consume aquí; nunca llega al cliente.
        # El registro de reset ya existe, el usuario puede reintentar. Se loguea en el adapter.
        pass

async def reset_password(self, command: ResetPassword) -> None:
    token_hash = self._api_keys.digest(command.token)
    now = self._clock.now_utc()
    record = await self._accounts.find_valid_reset(token_hash, now)
    if record is None:
        raise Unauthorized("El enlace no es válido o ya expiró", "invalid")
    new_hash = await self._passwords.hash_password(command.new_password)
    await self._accounts.update_password_hash(record.owner, record.account_id, new_hash)
    await self._accounts.mark_reset_used(record.id, now)
    await self._accounts.invalidate_resets_for_account(record.owner, record.account_id, now)
    return
```

Imports nuevos en el módulo: `secrets`, `from datetime import timedelta`,
`from app.application.errors import ... (ya está Unauthorized; ApplicationError para el
except de send_reset_email)`,
`from app.domain.models import RequestPasswordReset, ResetPassword`,
`from app.domain.value_objects import EmailJob`,
`from app.infrastructure.delivery.templates.password_reset_email import password_reset_html, PASSWORD_RESET_SUBJECT`
(o pasar la función de plantilla por inyección para no romper la dirección de
dependencias; dado el estilo actual, importar directo es aceptable).

**Anti-enumeración (corrige el hallazgo de revisión MEDIUM #3).** El objetivo declarado es
**misma respuesta (status + cuerpo)** exista o no el email, y **minimizar** la señal
temporal — explícitamente **no** se garantiza constancia temporal estricta al milisegundo.
Dos medidas concretas:

1. **El envío de correo sale del camino de la respuesta.** La parte cara y de latencia
   variable es el POST HTTP a Resend (timeout 10 s). Si se ejecutara inline solo en la rama
   "email existe", esa rama respondería sistemáticamente más lento — justo la señal que se
   quiere eliminar. Por eso `request_password_reset` **no** envía: devuelve un `EmailJob` (o
   `None`) y el **router encola el envío en un `BackgroundTask` de FastAPI**
   (`starlette.background`), que corre **después** de enviar la respuesta. Así `/recuperar`
   responde sin esperar a Resend en ninguna de las dos ramas. Verificado que el proyecto es
   FastAPI, por lo que `BackgroundTasks` está disponible sin dependencias nuevas.
2. **La rama "no existe" gasta un verify bcrypt** con `_burn_verification("reset")` (ya
   existe en `AuthUseCases` con firma `_burn_verification(self, password: str)`: cachea
   `self._dummy_hash = hash_password("qhub-sin-cuenta")` y hace `verify_password(password,
   dummy)`; el argumento es irrelevante para el resultado y para el costo). Esto equipara el
   costo de hash entre ramas. Se pasa un literal neutro (`"reset"`), no `email_norm`, para
   no sugerir que el email viaja a la verificación (hallazgo NIT #4).

Asimetría residual reconocida (no eliminada, declarada fuera de alcance consciente): la rama
"existe" hace un INSERT en `password_resets` que la rama "no existe" no hace, y
`find_reset_target` puede recorrer 1 o 2 tablas según dónde esté (o no) el email. Estas
diferencias son de orden de una query a Supabase, no del POST a Resend, y **no** se nivelan
en esta tarea. La afirmación firme es "misma respuesta y mismo cuerpo", no "mismo tiempo
exacto". Un rate limit por IP/email para encarecer el sondeo masivo queda fuera de alcance
(ver "Fuera de alcance").

**Hash del token (confirmado).** Se reutiliza `ApiKeyCodec.digest`, que es exactamente
`hashlib.sha256(plain.encode("utf-8")).hexdigest()` (ver
`app/infrastructure/security/api_keys.py`, función `hashear_api_key`). El token crudo es
`secrets.token_urlsafe(32)` y solo viaja en el enlace del correo; en la base de datos solo
se guarda el hash (`token_hash`, único). `ApiKeyCodec` ya está inyectado en `AuthUseCases`
como `self._api_keys`, así que no hay dependencia nueva para el hashing.

### Presentación — `app/api/schemas/auth.py`

```python
class RecuperarCrear(BaseModel):
    email: EmailStr

class RestablecerCrear(BaseModel):
    token: str = Field(min_length=1)
    password: str = Field(min_length=8, max_length=72)   # alineado con bcrypt y validatePassword

class MensajeOut(BaseModel):
    detail: str
```

### Presentación — `app/api/routers/auth.py`

```python
@router.post("/recuperar", response_model=MensajeOut)
async def recuperar(
    datos: RecuperarCrear,
    background: BackgroundTasks,
    casos: AuthUseCases = Depends(get_auth_use_cases),
):
    try:
        job = await casos.request_password_reset(RequestPasswordReset(email=str(datos.email)))
    except ApplicationError as exc:
        raise http_error(exc) from exc
    if job is not None:
        # El envío corre DESPUÉS de responder (fuera del camino de la respuesta): anti-enumeración.
        background.add_task(casos.send_reset_email, job)
    return MensajeOut(detail="Si el correo está registrado, te enviamos un enlace para restablecer la contraseña.")

@router.post("/restablecer", response_model=MensajeOut)
async def restablecer(datos: RestablecerCrear, casos: AuthUseCases = Depends(get_auth_use_cases)):
    try:
        await casos.reset_password(ResetPassword(token=datos.token, new_password=datos.password))
    except ApplicationError as exc:
        raise http_error(exc) from exc
    return MensajeOut(detail="Tu contraseña se actualizó. Ya puedes iniciar sesión con la nueva.")
```

Imports del router a ampliar: `from fastapi import APIRouter, Depends, Header,
BackgroundTasks` (hoy es `APIRouter, Depends, Header`) y añadir
`RecuperarCrear, RestablecerCrear, MensajeOut` al import de `app.api.schemas.auth`, más
`RequestPasswordReset, ResetPassword` al import de `app.domain.models`.

`/recuperar` devuelve **siempre** 200 con el mismo texto (anti-enumeración).
`/restablecer` devuelve 401 (`Unauthorized reason="invalid"`) si el token no es válido o
expiró. Ambos ya son públicos: `transport.ts` trata `/auth/*` como `isPublicPath`, así que
el front no adjunta token.

### Composición — `app/dependencies/Dependencies.py`

**Estado actual (verificado).** El provider declarativo existente es
`auth = providers.Factory(AuthUseCases, accounts, password_hasher, api_keys, tokens, clock)`
(exactamente ese orden de 5 argumentos posicionales, que coincide con la firma actual de
`AuthUseCases.__init__`). En `build_container` el grafo se resuelve con `auth =
container.auth()` y luego se pasa a `RuntimeContainer(..., auth=auth, ...)`. Los use cases
que dependen de selección en runtime (`notifications`, `turns`, `sweeps`, `queues`) **no**
usan provider declarativo: se instancian a mano dentro de `build_container`. El patrón de
selección por settings ya existe en `_select_channels`.

**Cambio 1 — providers nuevos en la clase `Dependencies`** (Factory, junto a los demás
providers de infraestructura):

```python
resend_email_sender: providers.Factory[ResendEmailSender] = providers.Factory(
    ResendEmailSender, settings.provided.RESEND_API_KEY, settings.provided.EMAIL_FROM)
log_email_sender: providers.Factory[LogEmailSender] = providers.Factory(LogEmailSender)
```

**Cambio 2 — selección del adaptador en `build_container`** (mismo lugar y estilo que
`_select_channels`, justo antes de resolver `auth`):

```python
email_sender = (container.resend_email_sender()
                if settings.RESEND_API_KEY.strip()
                else container.log_email_sender())
```

**Cambio 3 — ampliar `auth` con los 3 argumentos nuevos.** Se **conserva** el provider
declarativo `auth` (sigue aportando los 5 primeros argumentos) y se le **añaden al
llamarlo** los tres nuevos como posicionales; `dependency-injector` concatena los
argumentos de la llamada después de los declarados, de modo que quedan en el orden
`(accounts, password_hasher, api_keys, tokens, clock, emails, reset_url, reset_ttl)` que es
exactamente la firma ampliada de `AuthUseCases.__init__`:

```python
auth = container.auth(
    email_sender,
    settings.PASSWORD_RESET_URL,
    settings.PASSWORD_RESET_TTL_MINUTOS,
)
```

No se elimina ni duplica el provider declarativo; solo cambia la **llamada** en
`build_container` (de `container.auth()` a `container.auth(email_sender, …)`). El resto del
grafo y `RuntimeContainer(..., auth=auth, ...)` no cambian, y `deps.get_auth_use_cases`
sigue devolviendo la misma instancia sin cambios.

> Nota de firma: `AuthUseCases.__init__` pasa de 5 a 8 parámetros
> (`accounts, passwords, api_keys, tokens, clock, emails, reset_url, reset_ttl_minutos`).
> Los tres nuevos van **al final** para no romper ninguna llamada posicional existente.

---

## Web — archivos y cambios

> **Nota de rutas (importante).** La web ya tiene un flujo de reset **propio de la
> plataforma** (Supabase Auth) montado en `/restablecer` (`ResetPasswordPage` +
> `SecurityRepository.requestPasswordReset`/`setPassword`, usado por `LoginPage`). Ese es
> el reset del **login del panel web**, distinto del reset de las **credenciales de la API
> de Qhub** que pide esta tarea. Para no colisionar con la ruta existente, las pantallas
> nuevas usan el prefijo `/qhub/`:
> `/qhub/recuperar` (pedir enlace) y `/qhub/restablecer` (elegir contraseña nueva). El
> enlace del correo que arma la API apunta a `{PASSWORD_RESET_URL}/qhub/restablecer?token=…`
> (coherente con el `request_password_reset` de la API de arriba).

### Entidades — `packages/api-client/src/domain/entities.ts`

No hacen falta tipos nuevos: ambos métodos devuelven `Result<void>`. (Si se quisiera
tipar la respuesta, sería `{ detail: string }`, pero el front solo necesita ok/falla.)

### Interfaz — `packages/api-client/src/domain/repositories.ts`

Agregar a `interface AuthRepository`:

```typescript
/** `POST /auth/recuperar`. Responde igual exista o no el correo. */
requestPasswordReset(email: string): Promise<Result<void>>;
/** `POST /auth/restablecer` con el token del enlace. */
resetPassword(token: string, newPassword: string): Promise<Result<void>>;
```

### Implementación — `packages/api-client/src/data/repositories/auth.ts`

Siguiendo el estilo de `login()`/`register()` (usa `guard`, `call`, `mapError`, `obj`):

```typescript
requestPasswordReset(email: string): Promise<Result<void>> {
  return guard(async () => {
    await call(this.t, { method: 'POST', path: '/auth/recuperar', body: { email } });
  }, mapError);
}
resetPassword(token: string, newPassword: string): Promise<Result<void>> {
  return guard(async () => {
    await call(this.t, { method: 'POST', path: '/auth/restablecer', body: { token, password: newPassword } });
  }, mapError);
}
```

(`call` acepta 200/201/204 por defecto; `/auth/*` es público en `transport.ts`.)

### Doble de prueba — `apps/web/src/testing/fakes.ts`

`FakeAuthRepository` **debe** agregar los dos métodos (si no, deja de compilar al cambiar
la interfaz). Con control de fallo estilo `loginFailure`:

```typescript
resetRequests: string[] = [];
resets: Array<{ token: string; password: string }> = [];
requestResetFailure: Failure | null = null;
resetFailure: Failure | null = null;
async requestPasswordReset(email: string): Promise<Result<void>> {
  this.resetRequests.push(email);
  return this.requestResetFailure ? err(this.requestResetFailure) : ok(undefined);
}
async resetPassword(token: string, password: string): Promise<Result<void>> {
  this.resets.push({ token, password });
  return this.resetFailure ? err(this.resetFailure) : ok(undefined);
}
```

(El `requestPasswordReset` de la línea 273 pertenece a `FakeSecurity` — plataforma web —
y no se toca.)

### Modal de credenciales — `apps/web/src/features/qhub/CredentialsDialog.tsx`

Cuando hay error (`err` definido), renderizar enlaces de ayuda usando el prop `action` de
`Notice` (ya soportado en `display.tsx`, se dibuja bajo el título). El componente recibe
dos callbacks nuevos opcionales para no acoplarlo al router:

```tsx
export function CredentialsDialog({ ..., onForgot, onRegister }: {
  ...; onForgot?: () => void; onRegister?: () => void;
}) { ... }

{err && (
  <Notice kind="error" title={err} action={
    <div className="flex flex-wrap gap-4">
      {onForgot && <a href="#" onClick={(e) => { e.preventDefault(); onForgot(); }}>¿Olvidaste tu contraseña?</a>}
      {onRegister && <a href="#" onClick={(e) => { e.preventDefault(); onRegister(); }}>¿No tienes cuenta? Regístrate en Qhub</a>}
    </div>
  } />
)}
```

Comportamiento intacto: los enlaces solo aparecen cuando hay error. El componente que usa
`CredentialsDialog` cablea `onForgot={() => navigate('/qhub/recuperar')}` y
`onRegister={() => navigate('/connect')}` con la pestaña de registro (`ConnectPage` usa
`/connect`, su `Tabs` índice 1 = "Crear cuenta"; para abrir esa pestaña directo se navega
a `/connect` — el salto a la pestaña de registro puede hacerse luego con un query opcional
`?tab=registro`, fuera del alcance mínimo). Si el llamador no pasa los callbacks, el modal
se comporta exactamente como hoy.

### Rutas y pantallas — `apps/web/src/app/AppRoutes.tsx`

Agregar dos rutas dentro del `<Route element={<Gate />}>`. Son públicas, pero su
accesibilidad la garantiza la precedencia en `resolve-redirect.ts` descrita abajo (no el
mecanismo de sesión de recuperación de `/restablecer`):

```tsx
const QhubRequestResetPage = lazy(() => import('@/features/qhub/QhubRequestResetPage').then((m) => ({ default: m.QhubRequestResetPage })));
const QhubResetPasswordPage = lazy(() => import('@/features/qhub/QhubResetPasswordPage').then((m) => ({ default: m.QhubResetPasswordPage })));
...
<Route path="/qhub/recuperar" element={<QhubRequestResetPage />} />
<Route path="/qhub/restablecer" element={<QhubResetPasswordPage />} />
```

`apps/web/src/app/resolve-redirect.ts` — **punto crítico de accesibilidad (corrige el
hallazgo de revisión HIGH)**. El destinatario del correo llega **sin sesión**: el reset de
las credenciales de la API de Qhub **no crea ninguna sesión web** (a diferencia de
`/restablecer` del panel, que funciona solo porque el enlace de Supabase Auth establece una
sesión de recuperación — por eso ahí `signedIn` ya es `true`). El primer guardado real de
`resolveRedirect` es `if (!o.signedIn) return here === '/login' ? null : '/login';`, que
corre **antes** de cualquier chequeo de ruta específica (`here === '/restablecer'` está más
abajo). Por tanto **no basta** con tratar `/qhub/*` "igual que `/restablecer`": un anónimo
sería expulsado a `/login` antes de llegar a la pantalla.

Fix exacto: declarar ambas rutas como verdaderamente públicas **al inicio** de
`resolveRedirect`, antes del guardado `authLoading`/`!signedIn`:

```ts
export function resolveRedirect(o: { location: string; /* ... */ }): string | null {
  const here = o.location;
  // Accesibles con o sin sesión: el destinatario del correo de reset de Qhub es anónimo.
  if (here === '/qhub/recuperar' || here === '/qhub/restablecer') return null;
  const entry = ['/login', '/setup', '/connect', '/cargando', '/', '/verificacion'];
  if (o.authLoading || (o.signedIn && o.mfa === 'checking')) return null;
  if (!o.signedIn) return here === '/login' ? null : '/login';
  // ...resto sin cambios...
}
```

La precedencia es obligatoria: el chequeo de `/qhub/*` va **arriba** de `authLoading` y de
`!signedIn`. Las dos pantallas nuevas (abajo) usan `useContainer().auth` y **no** dependen
de `useSession()` (un anónimo no tiene sesión), de modo que renderizan igual con o sin
sesión. Verificado contra `resolve-redirect.ts` (guardado `!o.signedIn` en línea previa al
chequeo de `/restablecer`) y el comentario de `ResetPasswordPage.tsx` ("la sesión ya viene
en la URL").

**Pantalla (a) `apps/web/src/features/qhub/QhubRequestResetPage.tsx`** — pide el correo y
llama `auth.requestPasswordReset`. Reusa `Panel`, `Logo`, `EmailField`, `Button`,
`Notice` (mismo molde visual que `ResetPasswordPage`/`ConnectPage`). Tras responder,
muestra siempre el mensaje neutro **sin revelar si el correo existe**:
"Si el correo está registrado en Qhub, te enviamos un enlace para elegir una contraseña
nueva. Revisa también el spam." Valida el formato del email con `validateEmail` de
`@qhub/core` antes de llamar. En fallo de red/servidor muestra `Notice kind="error"` con
`failure.message`.

**Pantalla (b) `apps/web/src/features/qhub/QhubResetPasswordPage.tsx`** — lee `?token=`
de la URL (`useSearchParams`), pide contraseña nueva + repetir, valida `validatePassword`
(8–72 caracteres; el techo 72 coincide con `RestablecerCrear.password` `max_length=72` de
la API, de modo que front y API rechazan lo mismo) y llama
`auth.resetPassword(token, pw)`. Reusa `TextField`/`StrengthMeter`/`GeneratePassword`/
`Button`/`Notice` como `ResetPasswordPage`.

**Destino post-éxito (corrige el hallazgo de revisión MEDIUM #2 — opción a).** En éxito la
pantalla **NO navega a `/connect`**. El destinatario del correo llega **sin sesión web** (es
la misma premisa que hace pública la ruta en `resolve-redirect.ts`), y `/connect` **no** está
en el early-return de rutas públicas: el guardado `if (!o.signedIn) return here === '/login'
? null : '/login';` corre **antes** del chequeo `!o.connected → /connect`, así que un anónimo
que navegue a `/connect` es expulsado de inmediato a `/login` (verificado en
`resolve-redirect.ts`). Además el mensaje de éxito no sobreviviría a la navegación (no hay
estado persistente) y `ConnectPage` usa `useSession()` y asume contexto de organización, por
lo que no rinde sin sesión. Por eso, en éxito la pantalla **se queda en `/qhub/restablecer`**
y reemplaza el formulario por un `Notice kind="success"` con el texto "Tu contraseña se
actualizó. Ya puedes iniciar sesión con la nueva." y, usando el prop `action` de `Notice`, un
enlace explícito al destino real: **"Inicia sesión en el panel" → `/login`** (el login del
panel web). No se usa `navigate('/connect')`. (Las credenciales recién restablecidas son las
de la **API de Qhub**; si más adelante se quisiera llevar al usuario directo a reconectar con
Qhub desde `CredentialsDialog`, ese flujo requiere sesión del panel y queda fuera de esta
pantalla.)

En fallo (token inválido/expirado → 401 → `unauthorizedFailure`) muestra un `Notice
kind="error"` claro en español con un enlace a `/qhub/recuperar` para pedir uno nuevo. Si no
hay `token` en la URL, muestra el mismo error con el enlace para volver a pedir.

Ambas pantallas usan `useContainer().auth` (el `AuthRepository`), no `security`.

---

## Manejo de errores (por operación)

API:

- **`find_reset_target` / `create_password_reset` / `find_valid_reset` / `mark_reset_used`
  / `update_password_hash` / `invalidate_resets_for_account`**: un fallo de query del
  AsyncClient levanta una excepción **cruda** (postgrest/APIError), **no** un
  `ApplicationError` — solo `start()`/`require_client()` levantan `PersistenceUnavailable`.
  Por eso **cada** método envuelve sus llamadas en `try/except Exception` y traduce
  **directamente** a `PersistenceFailure(operation=<método>)`, preservando el nombre real del
  método (**no** se reutiliza `map_registration_error`, que tiene semántica de registro:
  23505 → 409 "email ya registrado", 23514 → 422 de registro, default →
  `operation="register"`; ver "Infra — account_repository.py", hallazgo #1). La colisión de
  `token_hash` (`23505` en `create_password_reset`) se trata como cualquier fallo de
  persistencia → 500 genérico (preserva anti-enumeración; no es un 409 distinguible), con
  reintento local opcional. Resultado al cliente: 500 con `detail` controlado, nunca un 500
  crudo de FastAPI ni un 409/422 de registro. Recuperable reintentando. El handler global
  (en `app/api/core/error_handlers.py`) registra a nivel error todo 500.
- **`update_password_hash` afecta 0 o >1 filas**: `PersistenceFailure(operation=
  "update_password_hash")` (500) y log a nivel error; nunca sobrescribe credenciales ajenas
  (defensa del hallazgo #5, anclaje por PK real).
- **Envío de correo (`EmailSender.send`)**: ocurre en un `BackgroundTask` **después** de
  responder (anti-enumeración), dentro de `AuthUseCases.send_reset_email`. Fallo transitorio
  (red) o permanente (Resend 4xx) → `PermanentDeliveryError`, que `send_reset_email`
  **captura y traga** (`except ApplicationError: pass`); el adapter ya registró el fallo a
  nivel `warning` sin el cuerpo ni el token. No afecta a la respuesta (ya enviada). El
  registro de reset ya quedó creado, así que si el correo no salió el usuario puede
  reintentar. `PermanentDeliveryError` no tiene status en `STATUS_BY_TYPE`
  (`app/api/core/error_handlers.py`) y no se expone: `http_error` (`app/api/core/deps.py`)
  ni siquiera llega a verlo porque el error se consume dentro del `BackgroundTask` (ver nota
  NIT #3).
- **Token inválido/expirado/usado en `reset_password`**: `find_valid_reset` devuelve
  `None` → `Unauthorized(..., "invalid")` → 401. Recuperable: el usuario pide otro enlace.
  No se registra (es un caso esperado de entrada del usuario).
- **Hash de la contraseña nueva (`hash_password`)**: si bcrypt falla → `CryptoFailure`
  (500, ya mapeado y logueado). Fatal para esa request; el reset no se marca usado.
- **Orden de efectos en `reset_password`**: primero `update_password_hash`, luego
  `mark_reset_used`, luego `invalidate_resets_for_account`. Si el update de hash falla, el
  token sigue válido (no se marcó usado) y el usuario puede reintentar. Idempotencia
  razonable: un segundo POST con el mismo token ya usado cae en `find_valid_reset -> None`
  (porque `usado_en` quedó set) → 401.

Validación de entradas (API):

- `/auth/recuperar` `email`: requerido, `EmailStr` (Pydantic 422 si el formato es
  inválido — pero para no filtrar, el 422 solo ocurre por formato, nunca por existencia).
- `/auth/restablecer` `token`: requerido, `str` no vacío. `password`: requerido, `str`,
  `min_length=8`, **`max_length=72`**. El techo 72 (no 128) es deliberado y corrige el
  hallazgo de revisión MEDIUM: `validatePassword` en `packages/core/src/validation.ts`
  rechaza >72 ("Usa 72 caracteres como máximo") porque bcrypt **trunca silenciosamente a
  72 bytes**; un `max_length=128` dejaría pasar en la API contraseñas de 73–128 que el
  front rechaza (inconsistencia observable) y además serían truncadas por bcrypt. Se usa
  **un único valor (72) en ambos lados**. (Nota: `RegistroCrear.password` conserva
  `max_length=128` por compatibilidad con el registro existente; esa discrepancia ya
  existe y queda fuera del alcance de esta tarea, que solo fija el campo nuevo.) Falla →
  422.

Validación de entradas (web): `QhubRequestResetPage` valida email con `validateEmail`;
`QhubResetPasswordPage` valida contraseña con `validatePassword` y la confirmación. Fallos
de formato se muestran inline sin llamar a la API.

Invariantes y dónde se aplican:

- **Anti-enumeración** (misma respuesta y cuerpo exista o no el email; señal temporal
  minimizada, no constante al milisegundo — ver nota #3): la **capa de aplicación**
  (`AuthUseCases.request_password_reset`) usa `_burn_verification` en la rama "no existe" y
  **devuelve el envío como `EmailJob`** para que el router lo encole en un `BackgroundTask`
  fuera del camino de la respuesta; el router responde el mismo texto genérico fijo. No se
  delega al front.
- **Nunca se guarda el token crudo**: la **capa de aplicación** hashea antes de persistir
  (`create_password_reset` solo recibe `token_hash`); el repo nunca ve el crudo.
- **El `password_hash` nuevo lo produce el `PasswordHasher` inyectado** (bcrypt), nunca la
  capa de persistencia: consistente con `register()`.

---

## Testabilidad

- **Unitario (API)**: `AuthUseCases.request_password_reset`/`send_reset_email`/
  `reset_password` con un `AccountRepository` fake en memoria, un `EmailSender` fake que
  registra las llamadas, un `Clock` fijo y el `ApiKeyCodec` real. Casos:
  - email existente → `request_password_reset` crea el reset (con `account_id` = PK real) y
    **devuelve un `EmailJob`** cuyo `html` contiene el token crudo en el link; aún no se
    envió nada por el fake;
  - email inexistente → devuelve `None`, no se crea nada, se gastó `_burn_verification`;
  - `send_reset_email(job)` llama al `EmailSender` fake exactamente una vez; con un fake que
    lanza `PermanentDeliveryError`, `send_reset_email` **no** propaga (lo traga);
  - para una empresa con **dos subcuentas** (mismo `empresa_id`, distinto `email`/`id`): el
    reset de una fija `account_id` a su PK y el UPDATE/invalidación tocan **solo** esa
    cuenta (verifica el fix de #5/#6);
  - token válido → actualiza hash de la fila correcta + marca usado + invalida solo los
    resets de ese `account_id`; token inválido/expirado/usado → 401.
- **Unitario (API)**: `ResendEmailSender` con un `httpx.MockTransport` para 200 (ok) y
  4xx (levanta `PermanentDeliveryError`), sin red real.
- **Integración (API)**: endpoints `/auth/recuperar` y `/auth/restablecer` con
  `TestClient`/`httpx.AsyncClient` y el `AccountRepository` fake vía override del
  container, verificando status y cuerpo genérico. `LogEmailSender` como fallback para que
  el flujo corra sin `RESEND_API_KEY`.
- **Unitario (web)**: `AuthRepositoryImpl.requestPasswordReset`/`resetPassword` con un
  `HttpTransport` fake comprobando método, path y body. Las pantallas nuevas con
  `FakeAuthRepository` (ver dobles): `QhubRequestResetPage` muestra siempre el mensaje
  neutro; `QhubResetPasswordPage` con token válido muestra el `Notice kind="success"` con el
  enlace "Inicia sesión en el panel" (→ `/login`) y **no** navega a `/connect`, con token
  inválido muestra error + enlace a `/qhub/recuperar`. `CredentialsDialog` muestra los
  enlaces solo con error y dispara `onForgot`/`onRegister`.

Lo difícil de testear (envío real por Resend, UPDATE real en Supabase) queda tras las
interfaces `EmailSender` y `AccountRepository`, por eso el diseño las aísla: todo el flujo
se prueba sin red ni base de datos reales.

---

## Fuera de alcance

- El reset del **login del panel web** (Supabase Auth) ya existente — no se toca.
- Rate limiting específico para `/auth/recuperar` más allá del límite de auth ya existente.
- **Constancia temporal estricta** de `/auth/recuperar` (igualar la latencia al milisegundo
  entre email existente e inexistente). El diseño saca el envío de correo del camino de la
  respuesta y gasta un verify bcrypt en ambas ramas, pero no nivela el INSERT extra ni el
  número de tablas recorridas por `find_reset_target`. La garantía firme es "misma respuesta
  y cuerpo", no "mismo tiempo exacto" (ver nota anti-enumeración #3).
- Internacionalización del correo (se entrega solo en español, en archivo editable).
- Rotación o expiración proactiva de tokens fuera del TTL y la invalidación al usarse.
- Verificación del correo del remitente / dominio propio en Resend (el default
  `onboarding@resend.dev` sirve para pruebas; el dominio propio es config del usuario).

---

## Lista de archivos

### API (`/home/miguelzambrano/projects/Qhub/qhub-api`)
Nuevos:
- `sql/001_password_resets.sql` (DDL, **aplicar manualmente en Supabase**)
- `app/domain/interfaces/email.py`
- `app/infrastructure/delivery/resend_email_sender.py`
- `app/infrastructure/delivery/log_email_sender.py`
- `app/infrastructure/delivery/templates/__init__.py`
- `app/infrastructure/delivery/templates/password_reset_email.py`

Modificados:
- `app/config/config.py` (4 settings + validador)
- `.env` (append de `EMAIL_FROM`, `PASSWORD_RESET_URL`, `PASSWORD_RESET_TTL_MINUTOS`; `RESEND_API_KEY` ya presente)
- `app/domain/models.py` (`RequestPasswordReset`, `ResetPassword`)
- `app/domain/value_objects.py` (`ResetTarget`, `PasswordResetRecord`, `EmailJob`)
- `app/domain/interfaces/accounts.py` (6 métodos)
- `app/infrastructure/persistence/supabase/account_repository.py` (impl de los 6 métodos, cada uno con el wrapping de errores)
- `app/application/use_cases/auth.py` (init + `request_password_reset` + `send_reset_email` + `reset_password`)
- `app/api/schemas/auth.py` (`RecuperarCrear`, `RestablecerCrear`, `MensajeOut`)
- `app/api/routers/auth.py` (`POST /auth/recuperar`, `POST /auth/restablecer`)
- `app/dependencies/Dependencies.py` (providers de email + selección + armado de `auth`)

### Web (`/home/miguelzambrano/projects/Qhub_Web`)
Nuevos:
- `apps/web/src/features/qhub/QhubRequestResetPage.tsx`
- `apps/web/src/features/qhub/QhubResetPasswordPage.tsx`

Modificados:
- `packages/api-client/src/domain/repositories.ts` (2 métodos en `AuthRepository`)
- `packages/api-client/src/data/repositories/auth.ts` (impl de los 2 métodos)
- `apps/web/src/testing/fakes.ts` (`FakeAuthRepository` + 2 métodos)
- `apps/web/src/features/qhub/CredentialsDialog.tsx` (enlaces de ayuda en error)
- `apps/web/src/app/AppRoutes.tsx` (2 rutas `/qhub/recuperar`, `/qhub/restablecer`)
- `apps/web/src/app/resolve-redirect.ts` (rutas públicas nuevas)
- componentes que montan `CredentialsDialog` (cablear `onForgot`/`onRegister`):
  `apps/web/src/features/qhub/ReconnectBanner.tsx` y
  `apps/web/src/features/settings/SettingsPage.tsx`. Los callbacks son opcionales, así que
  se cablean con `useNavigate` solo donde interese mostrar la ayuda.

---

## Respuestas a la revisión de diseño

### Segunda ronda de revisión (actual)

Revisión referenciada: `.agents/tasks/forgot-reset-password/design-review.md` +
`design-review.json` (veredicto `CHANGES_REQUESTED`; 0 HIGH, 2 MEDIUM, 2 NIT). Todos los
hallazgos verificados contra el código real antes de resolver
(`error_mapping.py`, `app/api/core/error_handlers.py`, `app/api/core/deps.py`,
`resolve-redirect.ts`, `auth.py`).

- **#1 [MEDIUM] — Reutilizar `map_registration_error` en los métodos de reset da semántica de
  error incorrecta. RESUELTO.** Verificado en `error_mapping.py`: `map_registration_error`
  mapea `23505 → Conflict "email ya registrado" (409)`, `23514 → UnprocessableInput de
  registro (422)`, `QEMP1 → NotFound "empresa"`, y default →
  `PersistenceFailure(operation="register")`. Un `23505` por colisión de
  `password_resets.token_hash` (unique) daría un 409 sin sentido y **rompería la
  anti-enumeración**, y los códigos desconocidos ocultarían el método real como
  `operation="register"`. Fix aplicado en "Infra — account_repository.py" y "Manejo de
  errores": los 6 métodos nuevos **ya no importan ni usan** `map_registration_error`;
  traducen **todo** fallo de query directamente a
  `PersistenceFailure(operation="<nombre_del_metodo>")`, preservando el nombre real del
  método. Para el `unique` de `token_hash` se documenta un reintento **local y explícito**
  (opcional) en `create_password_reset`, no vía el mapeo de registro; el comportamiento base
  (500 genérico, mismo cuerpo) ya preserva la anti-enumeración.

- **#2 [MEDIUM] — Post-éxito navega a `/connect` pero el anónimo es reenviado a `/login`.
  RESUELTO (opción a).** Verificado en `resolve-redirect.ts`: el guardado `if (!o.signedIn)
  return here === '/login' ? null : '/login';` corre **antes** del chequeo `!o.connected →
  /connect`, y `/connect` no está en el early-return público, así que un anónimo que navegue
  a `/connect` es expulsado a `/login` (y el toast de éxito no sobrevive; `ConnectPage` usa
  `useSession()` y asume organización). Fix aplicado en "Pantalla (b)
  `QhubResetPasswordPage.tsx`": en éxito la pantalla **se queda en `/qhub/restablecer`** y
  muestra un `Notice kind="success"` ("Tu contraseña se actualizó. Ya puedes iniciar sesión
  con la nueva.") con un enlace explícito vía el prop `action`: **"Inicia sesión en el panel"
  → `/login`**. No se usa `navigate('/connect')`. El test de la pantalla se actualizó en
  consecuencia.

- **#3 [NIT] — Ruta imprecisa de `error_handlers.py`. ANOTADO.** Se corrigieron las citas:
  `STATUS_BY_TYPE` vive en `app/api/core/error_handlers.py` y `http_error(error)` en
  `app/api/core/deps.py` (`HTTPException(STATUS_BY_TYPE.get(type(error), 500),
  error.detail)`). Actualizado en la nota de `PermanentDeliveryError` y en "Manejo de
  errores". Verificado en el repo.

- **#4 [NIT] — `_burn_verification(email_norm)` con firma `password: str`. RESUELTO.** La
  llamada pasa a `_burn_verification("reset")` (literal neutro) con un comentario que aclara
  que el valor es irrelevante para el resultado y el costo; se evita sugerir que el email
  viaja a la verificación. Actualizado en el snippet de `request_password_reset` y en la nota
  de anti-enumeración. Verificado que la firma real es
  `_burn_verification(self, password: str)`.

### Primera ronda de revisión (histórico)

Revisión previa (veredicto `CHANGES_REQUESTED`; 1 HIGH, 5 MEDIUM, 2 NIT). Todos los hallazgos
verificados contra el código real de ambos repos antes de resolver.

- **#1 [HIGH] — Destinatario sin sesión expulsado a `/login`. RESUELTO.** La sección
  "Rutas y pantallas" ya no dice "igual que `/restablecer`". Se especifica el fix exacto:
  en `resolve-redirect.ts`, un chequeo `if (here === '/qhub/recuperar' || here ===
  '/qhub/restablecer') return null;` **al inicio** de `resolveRedirect`, antes de
  `authLoading` y de `!signedIn`. Las pantallas usan `useContainer().auth`, no
  `useSession()`. Verificado el orden del guardado en `resolve-redirect.ts`.

- **#2 [MEDIUM] — Afirmación falsa de mapeo automático de errores de persistencia.
  RESUELTO.** Se corrigió el texto de "Manejo de errores" y se especificó que **cada** método
  nuevo del repo envuelve sus llamadas en `try/except Exception`. (El mecanismo exacto de
  traducción fue afinado en la segunda ronda, hallazgo #1: se traduce **directamente** a
  `PersistenceFailure(operation=<método>)` sin pasar por `map_registration_error`.) Verificado
  en `account_repository.register()`, `error_mapping.py`, `app/api/core/error_handlers.py`,
  `client.py`.

- **#3 [MEDIUM] — Anti-enumeración temporal asimétrica. RESUELTO (opción a).** El envío de
  correo se saca del camino de la respuesta: `request_password_reset` devuelve un `EmailJob`
  y el router lo encola en un `BackgroundTask` de FastAPI (`send_reset_email`). La afirmación
  se degradó a "misma respuesta y cuerpo"; la constancia temporal estricta se declara
  explícitamente fuera de alcance (la asimetría residual del INSERT y del recorrido de tablas
  queda reconocida, no eliminada). Verificado que el proyecto es FastAPI (BackgroundTasks
  disponible).

- **#4 [MEDIUM] — `max_length` 128 vs 72. RESUELTO.** `RestablecerCrear.password` pasa a
  `max_length=72`, alineado con bcrypt (truncado a 72 bytes) y con `validatePassword`
  (rechaza >72). Un único valor en front y API. Se documenta que `RegistroCrear` mantiene 128
  por compatibilidad y que esa discrepancia preexistente queda fuera de alcance. Verificado
  en `validation.ts:71` y `schemas/auth.py:34`.

- **#5 [MEDIUM] — Doble UPDATE por `ilike(email)` sin salvaguarda. RESUELTO (opción b +
  defensa).** El UPDATE para EMPRESA pasa de `.ilike("email", …)` a `.eq("id",
  str(account_id))` usando la **PK real** de `control_empresas` leída en `find_reset_target`.
  Además se añade verificación de filas afectadas (`len(result.data) == 1`, si no
  `PersistenceFailure`). Verificado que `control_empresas` tiene columna `id` propia
  (`identifier_exists` hace `.select("id")`).

- **#6 [MEDIUM] — `ResetTarget` no transporta la PK real. RESUELTO (por-cuenta).**
  `ResetTarget` y `PasswordResetRecord` llevan `account_id` (PK real:
  `control_empresas.id` / `usuarios.id`); `password_resets` gana columna `account_id`;
  `find_reset_target` selecciona `id` además de `owner_column`; la invalidación pasa a
  `invalidate_resets_for_account` filtrando por `account_id`. Así el reset y la invalidación
  son **por cuenta**, no por `empresa_id`, de forma coherente con el UPDATE de #5. Verificado
  en `find_login`/`register` (coexistencia de subcuentas con mismo `empresa_id`).

- **#7 [NIT] — `PermanentDeliveryError` no está en `STATUS_BY_TYPE`. ANOTADO.** Se añadió
  nota: el error se consume íntegramente en la capa de aplicación (`send_reset_email` dentro
  del `BackgroundTask`) y nunca se expone por el handler global. Verificado en
  `app/api/core/error_handlers.py`.

- **#8 [NIT] — URL de Resend no verificable. ANOTADO.** Comentario en el snippet de
  `resend_email_sender.py`: la URL/forma del body se confirma contra la doc oficial de Resend
  al implementar; el test con `httpx.MockTransport` cubre el contrato local, no el real.
