# Revisión de diseño — "Olvidé / restablecer contraseña" (Qhub API + Qhub Web)

Revisión independiente del documento `.agents/tasks/forgot-reset-password/design.md`, leído
sin el contexto que lo produjo. Todas las afirmaciones del diseño sobre el código existente
se verificaron leyendo las fuentes reales de ambos repos. No se ejecutaron builds ni tests
(revisión de diseño).

Ámbito verificado explícitamente por el encargo:
- Mecanismo de migración → resuelto a ubicación/estilo concretos.
- Esquema exacto de `password_resets`.
- Ruta de actualización de `password_hash` para los dos tipos de cuenta.
- Comportamiento anti-enumeración.
- Hashing del token.
- Fallback de `EmailSender` (Resend vs Log).
- Rutas/pantallas del front y los enlaces de ayuda del `CredentialsDialog`.

---

## Hallazgos

### 1. [MEDIUM] `find_reset_target` selecciona la columna `id` dos veces en la rama USUARIO

**Dónde.** Sección "Infra — `account_repository.py`", especificación de `find_reset_target`:

> `table(table).select(f"id, {owner_column}, email")...`

iterando la misma tupla que `find_login()`:
`((EMPRESA, "control_empresas", "empresa_id"), (USUARIO, "usuarios", "id"))`.

**Problema.** Para la rama USUARIO, `owner_column == "id"`, de modo que la cadena del
`select` se expande literalmente a `"id, id, email"` — la columna `id` aparece **dos
veces**. Para la rama EMPRESA se expande a `"empresa_id, empresa_id, email"`… no: a
`"id, empresa_id, email"` (correcto), pero para USUARIO queda `"id, id, email"`. Un
`select` con columna duplicada es, en el mejor de los casos, redundante, y según cómo
PostgREST procese la lista puede devolver una sola clave `id` o comportarse de forma
inesperada. El diseño no resuelve esta ambigüedad: es una interpolación que produce SQL
distinto por rama y un caso degenerado en la rama USUARIO. Verificado contra `find_login`,
que para USUARIO selecciona `f"{owner_column}, password_hash, activa"` = `"id,
password_hash, activa"` (una sola vez), es decir el patrón existente NO duplica.

**Fix concreto.** Construir la lista de columnas sin duplicar, deduplicando `id` y
`owner_column`. Por ejemplo:

```python
cols = "id, email" if owner_column == "id" else f"id, {owner_column}, email"
result = (
    await self._client.table(table)
    .select(cols)
    .ilike("email", email_norm)
    .limit(1)
    .execute()
)
```

o, más explícito, usar un set ordenado de columnas (`{"id", owner_column, "email"}`) y
unirlas. En cualquier caso, el mapeo posterior debe leer `row["id"]` para `account_id` y
`row[owner_column]` para `owner`, que en USUARIO coinciden (ambos `id`).

---

### 2. [MEDIUM] `find_reset_target` usa `.ilike("email", email_norm)` sin escapar comodines del email

**Dónde.** Sección "Infra — `account_repository.py`", `find_reset_target`:

> `...select(...).ilike("email", email_norm).limit(1)...`

**Problema.** `email_norm` viene directamente del input del usuario
(`command.email.strip().lower()`). `ilike` interpreta `%` y `_` como comodines. Un email
como `a%@x.com` o `a_b@x.com` haría coincidir **otras** filas de login. En el flujo de
reset esto tiene dos consecuencias: (a) `find_reset_target` podría devolver una cuenta que
**no** corresponde al email tecleado, de modo que el enlace de reset se envía al `email` de
**esa** fila (`target.email`) — un email ajeno —, y (b) rompe la anti-enumeración de forma
sutil (un patrón con comodín que hace match revela existencia de cuentas). El diseño hereda
`.ilike` de `find_login`, pero ahí el identificador se compara igual y el riesgo ya existe;
para un flujo **nuevo** de recuperación de contraseña, propagar comodines del input a un
`ilike` es un fallo de validación/seguridad que debe resolverse, no heredarse. El diseño no
menciona escape de comodines ni validación del formato en la API más allá de `EmailStr`
(que **sí** rechaza `%`/`_` fuera de la parte local… pero `EmailStr` permite ciertos
caracteres y la normalización `.lower()` no elimina comodines si el validador los dejó
pasar; el punto es que el diseño no lo especifica).

**Fix concreto.** Elegir una de estas reglas y escribirla en el diseño:

- Preferido: comparar por igualdad case-insensitive sin comodines. Como PostgREST no tiene
  un operador "iequal" directo, normalizar el email a minúsculas **en la escritura** (ya se
  hace en registro) y comparar con `.eq("email", email_norm)`; o
- Escapar los comodines antes del `ilike`:
  `email_norm.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")` y documentar
  que Supabase/PostgREST respeta el escape. 

Indicar explícitamente cuál se usa y aplicar la misma regla en cualquier `ilike` sobre
email del nuevo flujo.

---

### 3. [MEDIUM] La ruta pública nueva en `resolve-redirect.ts` no cubre query strings ni variantes, y el contrato de `o.location` no está verificado

**Dónde.** Sección "Rutas y pantallas", fix de `resolve-redirect.ts`:

> `if (here === '/qhub/recuperar' || here === '/qhub/restablecer') return null;`

con `const here = o.location;`

**Problema.** El enlace del correo apunta a
`{PASSWORD_RESET_URL}/qhub/restablecer?token=<token>`, es decir la URL real **lleva query
string**. El chequeo usa igualdad estricta `here === '/qhub/restablecer'`. Si `o.location`
incluyera el query (`/qhub/restablecer?token=abc`), la igualdad estricta **fallaría** y el
anónimo sería expulsado a `/login` — exactamente el bug HIGH que el diseño dice haber
resuelto. El diseño afirma el fix pero **no verifica** qué contiene `o.location`: ¿es solo
`pathname` o `pathname+search`? En el `Gate` (verificado en `AppRoutes.tsx`) se lee
`const { pathname, search } = useLocation();` — ambos están disponibles, así que el llamador
podría pasar cualquiera de los dos. Las demás comparaciones del archivo
(`here === '/restablecer'`, `entry.includes(here)`) asumen **solo pathname**, pero eso es
una suposición no declarada en el diseño para la ruta nueva, y es justo la que hace o
deshace la accesibilidad del enlace del correo.

**Fix concreto.** Declarar explícitamente que `resolveRedirect` recibe **solo el
pathname** (sin query) y verificar/garantizar en el `Gate` que se pasa `pathname` (no
`pathname + search`) a `o.location`. Alternativamente, comparar por prefijo:
`if (here === '/qhub/recuperar' || here.startsWith('/qhub/restablecer')) return null;`
o normalizar dentro de `resolveRedirect` (`const path = here.split('?')[0]`). Escribir la
regla elegida en el diseño; sin ella, el destinatario del correo (que llega con `?token=`)
puede quedar fuera.

---

### 4. [MEDIUM] El prop `onForgot`/`onRegister` se añade a `CredentialsDialog` pero el diseño no especifica cómo se renderiza dentro del `Dialog` actual, y el snippet pone el enlace en el `title` de `Notice`

**Dónde.** Sección "Modal de credenciales — `CredentialsDialog.tsx`":

> renderizar enlaces de ayuda usando el prop `action` de `Notice` … `{err && (<Notice
> kind="error" title={err} action={…} />)}`

**Problema.** El componente real (verificado) hoy renderiza el error así:
`{err && <Notice kind="error" title={err} />}`. El diseño propone sustituirlo por un
`Notice` con `action`. Eso es correcto y `Notice` sí soporta `action` (verificado en
`display.tsx`: `action?: ReactNode`, se dibuja bajo el título con `mt-2`). **Pero** el
diseño describe el cambio con un bloque JSX genérico `{err && (...)}` que no coincide
textualmente con la línea existente y no indica que debe **reemplazar** esa línea exacta ni
dónde quedan los dos nuevos props en la firma desestructurada actual (hoy la firma es
`{ title, intro, confirmLabel, rememberLabel, onSubmit, onCancel }` sin `onForgot/onRegister`).
Un implementador podría duplicar el `Notice` (dejando dos avisos de error). Es un detalle de
integración no especificado de forma concreta.

**Fix concreto.** Especificar el reemplazo exacto de la línea
`{err && <Notice kind="error" title={err} />}` por el bloque con `action`, y añadir
`onForgot?: () => void; onRegister?: () => void;` a la firma desestructurada existente (no a
una firma reescrita). Indicar que es **sustitución**, no adición, del `Notice` de error.

---

### 5. [MEDIUM] No se especifica validación de la confirmación de contraseña en `QhubResetPasswordPage` (regla de igualdad)

**Dónde.** Sección "Pantalla (b) `QhubResetPasswordPage.tsx`":

> pide contraseña nueva + repetir, valida `validatePassword` … y la confirmación.

**Problema.** Se menciona "repetir" y "valida … la confirmación" pero **no se define la
regla**: ¿qué mensaje se muestra si no coinciden?, ¿se valida en submit o inline?, ¿se
pasa el `email` a `validatePassword` para la regla "no uses tu correo" (verificado:
`validatePassword(v, { email })` existe y, sin sesión, aquí **no hay email conocido**)?
El anónimo que restablece no tiene el email a mano (llega por token), así que la opción
`{ email }` de `validatePassword` no puede alimentarse — hay que decidir si se omite. Es un
hueco de especificación en una pantalla nueva: "valida la confirmación" admite varias
interpretaciones.

**Fix concreto.** Especificar: (a) regla de igualdad —"Las contraseñas no coinciden." si
`pw !== pw2`, validada en submit antes de llamar a la API; (b) llamar
`validatePassword(pw)` **sin** `{ email }` (no se conoce el email en esta pantalla), con el
techo de 72 ya alineado; (c) mostrar los errores de formato inline sin llamar a la API.

---

### 6. [NIT] El DDL de `password_resets` no define `on delete` ni FKs, y el diseño lo reconoce a medias

**Dónde.** DDL de `001_password_resets.sql`: `propietario_id uuid`, `account_id uuid` sin
`references`.

**Problema.** `account_id` apunta a `control_empresas.id` **o** `usuarios.id` según el
tipo; una FK polimórfica no es expresable con una sola FK, así que es razonable no ponerla.
Pero el diseño no dice nada sobre qué pasa con filas de `password_resets` cuando se borra la
cuenta asociada (quedan huérfanas). Dado que el flujo marca `usado_en` y expira por TTL, el
impacto es bajo, pero conviene anotarlo.

**Fix concreto.** Añadir un comentario en el `.sql` indicando que `account_id`/`propietario_id`
son referencias lógicas (no FKs por el polimorfismo) y que las filas caducan por TTL /
`usado_en`; opcionalmente un índice/limpieza periódica queda fuera de alcance (coherente con
la sección "Fuera de alcance").

---

### 7. [NIT] `find_valid_reset` mapea `OwnerId(PropietarioTipo(row["propietario_tipo"]), ...)` asumiendo que la columna guarda el `.value` del enum

**Dónde.** `find_valid_reset`: `OwnerId(PropietarioTipo(row["propietario_tipo"]), UUID(row["propietario_id"]))`.

**Problema.** Esto es consistente con `find_owner_by_api_key_digest` (verificado: hace
`PropietarioTipo(row["propietario_tipo"])` sobre `api_keys`). El valor escrito es
`target.owner.tipo.value` (`'empresa'`/`'usuario'`), compatible con `PropietarioTipo(...)`.
El riesgo es solo la variante "columna enum nativa de Postgres": al leer, PostgREST devuelve
el texto del enum igualmente, así que `PropietarioTipo(texto)` funciona. Correcto; se anota
por completitud porque depende del comportamiento de PostgREST con columnas enum, no
verificable desde el repo (el DDL del enum no está versionado).

**Fix concreto.** Ninguno obligatorio; mantener el test unitario que cubre el round-trip
`value → PropietarioTipo` con el fake. Anotarlo en el `.sql` junto a la nota del enum que ya
existe.

---

## Verdicto

HIGH: 0 — MEDIUM: 5 — NIT: 2. Al haber hallazgos MEDIUM, el veredicto es
**CHANGES_REQUESTED**.

---

## Suposiciones verificadas (correctas)

1. **`AuthUseCases.__init__` tiene exactamente 5 parámetros** `(accounts, passwords,
   api_keys, tokens, clock)` y `self._api_keys` queda disponible. Verificado en
   `app/application/use_cases/auth.py`. Los 3 nuevos al final no rompen llamadas
   posicionales.
2. **`_burn_verification(self, password: str)`** existe, cachea `self._dummy_hash` con
   `hash_password("qhub-sin-cuenta")` y hace `verify_password(password, dummy)`; el
   argumento no afecta el costo. Verificado. El cambio a `_burn_verification("reset")` es
   válido.
3. **El hashing del token reutiliza `ApiKeyCodec.digest` = `hashlib.sha256(...).hexdigest()`**.
   Verificado en `app/infrastructure/security/api_keys.py`.
4. **`map_registration_error` tiene semántica de registro** (`23505 → Conflict "email ya
   registrado" 409`, `23514 → UnprocessableInput 422`, `QEMP1 → NotFound`, default →
   `PersistenceFailure(operation="register")`). Verificado en `error_mapping.py`. La
   decisión de NO reutilizarlo y traducir a `PersistenceFailure(operation=<método>)` es
   correcta y preserva la anti-enumeración.
5. **`PersistenceFailure(operation=..., detail=...)`** existe con esa firma y mapea a 500 en
   `STATUS_BY_TYPE`. Verificado en `errors.py` y `error_handlers.py`.
6. **`PermanentDeliveryError` NO está en `STATUS_BY_TYPE`**, y su `reason` admite
   `'rejected'` (Literal `invalid_destination|rejected|unsupported`). Verificado en
   `errors.py` y `error_handlers.py`. `http_error` vive en `app/api/core/deps.py`
   (`HTTPException(STATUS_BY_TYPE.get(type(error), 500), error.detail)`). Verificado.
7. **El proyecto es FastAPI**, por lo que `BackgroundTasks` (starlette) está disponible sin
   dependencias nuevas; `httpx`, `secrets` y `hashlib` ya se usan. Verificado (routers con
   `Depends`, imports de FastAPI).
8. **`control_empresas` tiene una columna `id` propia distinta de `empresa_id`**, y pueden
   coexistir varias filas con el mismo `empresa_id`. Verificado: `identifier_exists` hace
   `.select("id")` sobre `control_empresas`; `register()` inserta `empresa_id =
   str(draft.owner.id)` reutilizando el id de la empresa para subcuentas. El anclaje del
   UPDATE por `control_empresas.id` es por tanto correcto y resuelve el doble-UPDATE.
9. **`find_login` para EMPRESA selecciona `empresa_id` (no `id`)** y para USUARIO `id`.
   Verificado. Confirma que `find_reset_target` necesita seleccionar además la PK real.
10. **La composición con `dependency-injector`**: el provider `auth` declara 5 posicionales
    y `build_container` lo resuelve con `container.auth()`. Verificado en `Dependencies.py`.
    Llamar `container.auth(email_sender, reset_url, reset_ttl)` concatena los extra tras los
    declarados (comportamiento estándar de `providers.Factory`), dejando la firma de 8.
11. **`_select_channels` y el patrón de selección por settings** existen; `settings.provided.X`
    funciona porque `settings` se sobreescribe con `providers.Object`. Verificado.
12. **`config.py`**: estilo de campos + `@field_validator`; `_max_intentos_positivo` existe
    como molde para `_ttl_positivo`. Verificado. Los 4 settings nuevos no colisionan con
    existentes.
13. **`validatePassword` rechaza > 72** ("Usa 72 caracteres como máximo") y `RegistroCrear.
    password` usa `max_length=128`. Verificado en `validation.ts` y `schemas/auth.py`. La
    decisión de `max_length=72` para `RestablecerCrear` alinea front y API.
14. **`Notice` soporta `action?: ReactNode`** y lo dibuja bajo el título. Verificado en
    `shared/ui/display.tsx`.
15. **`/auth/*` es público en `transport.ts`** (`isPublicPath`), y `call` acepta
    `[200,201,204]` por defecto; `unauthorizedFailure` para 401. Verificado.
16. **`AuthRepository` hoy solo tiene `login`/`register`**; `FakeAuthRepository` implementa
    ambos e importa `ok/err/Failure/Result`. Verificado en `repositories.ts` y `fakes.ts`.
    `FakeSecurity.requestPasswordReset` es un método distinto (plataforma web), no se toca.
17. **`CredentialsDialog` se monta en `ReconnectBanner` y `SettingsPage`** (ambas
    autenticadas). Verificado. El cableado opcional de `onForgot/onRegister` con
    `useNavigate` es viable.
18. **Las rutas `/connect` y `/restablecer` viven dentro de `<Route element={<Gate/>}>`** y
    `resolveRedirect` corre el guardado `if (!o.signedIn) ...` **antes** del chequeo
    `!o.connected → /connect`. Verificado en `AppRoutes.tsx` y `resolve-redirect.ts`. Esto
    confirma que (a) `/connect` NO es alcanzable por un anónimo (justifica el fix MEDIUM #2
    del diseño) y (b) el early-return de `/qhub/*` debe ir antes de `authLoading`/`!signedIn`.
19. **El repo de la API no versiona esquema/migraciones** (no hay `migrations/`, `*.sql`,
    `alembic.ini`), los RPC solo se invocan. Coherente con la decisión de un `sql/` manual.
    (No ejecuté `find`; me baso en la ausencia de referencias y en que `register()` invoca
    RPC sin definirlos — consistente con lo que afirma el diseño.)

## Suposiciones no verificadas o incorrectas

1. **`select("id, id, email")` en la rama USUARIO de `find_reset_target`** — INCORRECTA /
   degenerada. La interpolación `f"id, {owner_column}, email"` con `owner_column == "id"`
   duplica la columna. Ver hallazgo #1.
2. **`.ilike("email", email_norm)` trata el email como literal** — NO VERIFICADA y
   riesgosa: `%`/`_` del input actúan como comodines. Ver hallazgo #2.
3. **`o.location` en `resolveRedirect` es solo el pathname (sin `?token=`)** — NO
   VERIFICADA en el diseño; de ella depende que el enlace del correo (que lleva query) sea
   accesible. El `Gate` dispone de `pathname` y `search` por separado, así que el contrato
   debe fijarse explícitamente. Ver hallazgo #3.
4. **DDL del enum `propietario_tipo` y comportamiento de PostgREST con columna enum** — NO
   verificable desde el repo (el enum vive solo en Supabase). El diseño ya lo reconoce y
   ofrece variante `text + check`; la lectura `PropietarioTipo(row[...])` es consistente con
   `find_owner_by_api_key_digest`. Ver NIT #7.
5. **URL y forma del body de la API de Resend** (`https://api.resend.com/emails`) — NO
   verificable desde el repo (servicio externo). El diseño ya lo marca como "confirmar
   contra la doc al implementar" (su NIT #8). Se mantiene como anotación, no bloquea.
