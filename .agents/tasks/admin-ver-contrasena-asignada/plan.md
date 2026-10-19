# Implementation Plan — Admin: Ver contraseña inicial asignada de un miembro

Opción A (del usuario): extender el cifrado existente (`CLAVE_INICIAL_KEY` + `_shared/clave.ts`/`crypto.ts`) para que un administrador pueda ver la contraseña **inicial asignada** de cualquier miembro de su organización, reusando la Edge Function `qhub-clave`.

## Alcance y límite duro (debe quedar visible en la UI y en el resumen final)
Esto SOLO funciona para la contraseña que el administrador asignó al invitar, guardada **cifrada en reposo** (sobre AES-GCM `{v,iv,d}` en la columna `public.claves_iniciales.clave`, descifrable con `CLAVE_INICIAL_KEY`). Si el miembro cambió luego su contraseña por Supabase Auth, esa nueva contraseña es un hash de una sola vía y **NO se puede mostrar**. No se intenta mostrar hashes de Auth. La UI deja claro que es la «contraseña inicial asignada» y que puede estar desactualizada si la persona la cambió.

## Decisiones de diseño (con justificación breve)

1. **Dónde vive el sobre tras aceptar la invitación.** Hoy `public.claves_iniciales` tiene PK/FK `invitacion_id -> public.invitaciones(id)` y el trigger `borrar_clave_inicial` (migración `20261024000002_clave_inicial.sql`) BORRA la fila cuando `invitaciones.aceptada_en` deja de ser null. Es decir: una vez que el miembro acepta, el sobre cifrado ya NO existe. Para que el administrador pueda ver la contraseña de un **miembro** (que por definición ya aceptó), hay que **conservar el sobre más allá de la aceptación**.
   - **Decisión:** dejar de borrar el sobre al aceptar y re-vincularlo al par (organización, usuario). Se crea una tabla nueva `public.claves_asignadas (organizacion_id uuid, usuario_id uuid, clave text, creada_en timestamptz, primary key (organizacion_id, usuario_id))`, RLS activada sin políticas (igual que `claves_iniciales`: solo `security definer` la lee), y el trigger de aceptación, en vez de borrar, COPIA el sobre a `claves_asignadas` (upsert por org+usuario) antes de borrar la fila de `claves_iniciales`. Justificación: respeta "no texto plano / reusar el mismo cifrado" (se mueve el mismo sobre), mantiene intacto el flujo del invitado (sigue leyendo `claves_iniciales` por token, que se sigue borrando al aceptar), y da al admin una fuente estable keyed por miembro. Alternativa descartada: dejar el sobre en `claves_iniciales` y no borrarlo — rompería la unicidad por invitación y el contrato "se borra al aceptar" del invitado.
   - **Nota de seguridad / al usuario:** esto cambia una retención (antes el sobre se destruía al aceptar; ahora se conserva cifrado para que el admin lo vea). Es exactamente lo que el usuario pidió ("el admin debería poder ver todo eso"), pero es un cambio de comportamiento observable; el fixer/implementador debe confirmarlo si surge duda (ver instrucciones del workflow).

2. **Autorización server-side.** El chequeo de admin se hace DENTRO del SQL con `public.es_admin_org(p_org)` (mismo patrón que `perfil_de_miembro`/`editar_miembro` en `20261022000002_administrar_miembros.sql`), y se exige que `p_usuario` sea miembro de `p_org`. El cliente nunca se cree admin.

3. **Una sola Edge Function.** Se extiende `qhub-clave` para aceptar `{ token }` (invitado, sin cambios byte a byte) O `{ orgId, userId }` (admin). Se reusa `readInitialPassword` + `loadKey` tal cual. No se reimplementa cripto.

4. **Método web nuevo**: `memberInitialPassword(orgId, userId)` en `TeamPort`, implementado igual que `initialPassword(token)`.

5. **UI**: acción admin-only "Ver contraseña asignada" en la lista de miembros (solo con `canManage`), que abre un Dialog análogo al de `credentials` (correo + contraseña + copiar + aviso de "inicial asignada, puede estar desactualizada"). Si `null`, mensaje amable en español. No se inventa reset.

## Comandos de verificación del proyecto (descubiertos en exploración)
- Web (host tiene Node 22 + npm 10; Docker también): desde `/home/miguelzambrano/projects/Qhub_Web`:
  - Tipos: `npm run typecheck`
  - Tests: `npm run test -w @qhub/web` (vitest) o `npm run test --workspaces --if-present`
  - Build: `npm run build`
  - Todo junto en contenedor: `tool/verify.sh`
- Supabase Edge (`/home/miguelzambrano/projects/Qhub_App/supabase/functions`): la tarea deno es `deno test --allow-none _shared/` (solo pruebas sin red). **Deno NO está instalado en este host**, así que las pruebas Deno NO se pueden ejecutar aquí; la verificación de la función se limita a revisión de código + `deno check` si se instalara. Las pruebas de lógica pura viven en `_shared/clave_flow_test.ts` y `_shared/crypto_test.ts`.
- SQL: **no hay mecanismo de migración ejecutable local** (no hay Supabase CLI corriendo). Las migraciones son archivos `.sql` versionados en `/home/miguelzambrano/projects/Qhub_App/supabase/migrations/`. La nueva migración se aplica en producción con el flujo habitual del proyecto (Supabase CLI / SQL editor). Documentar que debe aplicarse manualmente/por despliegue.

---

## Items

- [ ] 1. **(SQL) Nueva migración: conservar el sobre cifrado por miembro + RPC admin.**
      Crear la tabla `public.claves_asignadas (organizacion_id uuid not null references public.organizaciones(id) on delete cascade, usuario_id uuid not null references public.perfiles(id) on delete cascade, clave text not null, creada_en timestamptz not null default now(), primary key (organizacion_id, usuario_id))`, con `alter table ... enable row level security;` y `revoke all ... from public, anon, authenticated;` (sin políticas, igual que `claves_iniciales`).
      Reemplazar el trigger de aceptación: cambiar `public.trg_borrar_clave_inicial()` para que, cuando `new.aceptada_en is not null`, primero COPIE el sobre a `claves_asignadas` (`insert ... select i.organizacion_id, (persona que aceptó = usuario con ese email) ...` — usar `new.organizacion_id` y el `usuario_id` recién insertado en `miembros`; obtener el uid vía `auth.users` por `lower(email)=lower(new.email)`), con `on conflict (organizacion_id, usuario_id) do update set clave = excluded.clave, creada_en = now()`, y SOLO entonces borre la fila de `claves_iniciales`. Mantener `security definer set search_path = ''`.
      Añadir RPC `public.clave_inicial_de_miembro(p_org uuid, p_usuario uuid) returns text language plpgsql stable security definer set search_path = ''`: si `not public.es_admin_org(p_org)` → `raise exception 'Sin permiso' using errcode = '42501'`; si `p_usuario` no está en `public.miembros(p_org)` → `raise exception 'No encontramos a esa persona en tu equipo' using errcode = 'P0002'`; devolver `clave` de `public.claves_asignadas` por `(p_org, p_usuario)` (o null si no hay). `revoke all ... from public, anon, authenticated;` y `grant execute ... to service_role;` (igual que `clave_inicial_cifrada`).
      Files: crear `/home/miguelzambrano/projects/Qhub_App/supabase/migrations/20261027000001_clave_asignada_de_miembro.sql`
      Verify (requiere contexto: no ejecutable local sin Supabase CLI): revisar que el SQL compila conceptualmente y respeta los patrones de `20261022000002_administrar_miembros.sql` y `20261025000002_clave_inicial_cifrada.sql`. Documentar en la cabecera del archivo que debe aplicarse por despliegue/Supabase CLI. Si hay un proyecto Supabase local, `supabase db reset` o aplicar el archivo en el SQL editor y comprobar que `clave_inicial_de_miembro` existe y niega a no-admin.

- [ ] 2. **(Edge) Extender `qhub-clave` para el flujo admin, sin tocar el flujo invitado.**
      En `Deno.serve`, tras autenticar al usuario, leer el body una vez. Si `b.token` es string no vacío → rama EXISTENTE sin cambios (RPC `clave_inicial_cifrada`). Si no hay token pero vienen `b.orgId` y `b.userId` (ambos uuid válidos) → rama admin: `admin.rpc("clave_inicial_de_miembro", { p_org: orgId, p_usuario: userId })`. Si no viene ni token ni (orgId+userId) → `400 { error: "Revisa los datos." }`. En ambas ramas, descifrar con `readInitialPassword(sealed, await loadKey(...))` y devolver `r.status, r.body`. Mantener CORS, `Cache-Control: no-store`, y los `console.error` sin filtrar el sobre. La rama admin propaga el error de la RPC (p.ej. 'Sin permiso') como 500 genérico igual que hoy (no se revela el motivo exacto al cliente), salvo que se quiera mapear 42501→403: mantener consistencia con el estilo actual devolviendo 500 genérico para no reescribir el manejo de errores de la RPC.
      Files: modificar `/home/miguelzambrano/projects/Qhub_App/supabase/functions/qhub-clave/index.ts`
      Verify (requiere contexto): Deno no está en el host; revisar manualmente que el flujo `{token}` queda idéntico y que el nuevo branch reusa `readInitialPassword`+`loadKey`. Las pruebas de lógica pura en `_shared` siguen pasando (no cambian). Si se instala Deno: `cd /home/miguelzambrano/projects/Qhub_App/supabase/functions && deno check qhub-clave/index.ts`.

- [ ] 3. **(Edge opcional, si aporta sin red) Extender pruebas de lógica pura.**
      `readInitialPassword` ya cubre los casos (null→200 null, sobre+clave→200 clave, fallos→500). No hay lógica nueva pura en la extensión (solo ruteo de inputs en `index.ts`, que requiere red). Dejar `_shared/clave_flow_test.ts` como está; añadir, si acaso, un comentario. No bloquear por esto.
      Files: `/home/miguelzambrano/projects/Qhub_App/supabase/functions/_shared/clave_flow_test.ts` (sin cambios funcionales)
      Verify: n/a (Deno ausente).

- [ ] 4. **(Web) Añadir `memberInitialPassword` al puerto `TeamPort`.**
      En `interface TeamPort`, añadir `/** La contraseña inicial que el administrador asignó a este miembro (si la hay y sigue cifrada). Puede estar desactualizada si la persona la cambió. */ memberInitialPassword(orgId: string, userId: string): Promise<Result<string | null>>;`
      Files: modificar `/home/miguelzambrano/projects/Qhub_Web/apps/web/src/features/staff/repository.ts`
      Verify: `cd /home/miguelzambrano/projects/Qhub_Web && npm run typecheck` (fallará hasta completar item 5 y 6 por implementaciones faltantes; verificar al final del item 6).

- [ ] 5. **(Web) Implementar `memberInitialPassword` en `SupabaseStaffRepository`.**
      Espejo de `initialPassword`: `return this.run(async () => { const r = await invokeFunction<{ clave: string | null }>(this.sb, 'qhub-clave', { orgId, userId }); if (!r.ok) throw r.failure; return r.value?.clave ?? null; });`
      Files: modificar `/home/miguelzambrano/projects/Qhub_Web/apps/web/src/features/staff/supabase-staff-repository.ts`
      Verify: parte del `npm run typecheck` del item 6.

- [ ] 6. **(Web) Implementar `memberInitialPassword` en el fake `FakeStaffRepository`.**
      Añadir campo `memberInitialPasswords: Record<string, string> = {};` (keyed por `userId`) y método `async memberInitialPassword(_o: string, userId: string): Promise<Result<string | null>> { this.calls.push(\`memberInitialPassword:${userId}\`); return ok(this.memberInitialPasswords[userId] ?? null); }`.
      Files: modificar `/home/miguelzambrano/projects/Qhub_Web/apps/web/src/testing/fakes.ts`
      Verify: `cd /home/miguelzambrano/projects/Qhub_Web && npm run typecheck` pasa (ya no faltan implementaciones del puerto).

- [ ] 7. **(Web UI) Acción admin "Ver contraseña asignada" + Dialog en `TeamPage`.**
      En la fila de cada miembro (bloque `canManage && !self`), añadir un control (p.ej. `Button kind="tertiary" size="sm"` con texto "Ver contraseña" o `IconButton icon="eye"/"key"` con `label`) que llame a un handler `viewPassword(m)`. El handler: `setWorking(m.userId)`, `const r = await staff.memberInitialPassword(orgId, m.userId)`, `setWorking(null)`; si `!r.ok` → `toast.show(r.failure.message, { error: true })`; si `r.value` es string → `setAssigned({ name: m.name, password: r.value })`; si `null` → abrir el mismo Dialog con estado "sin contraseña" (o `toast`/Notice con el mensaje amable). Añadir estado `const [assigned, setAssigned] = useState<{ name: string; password: string | null } | null>(null);`.
      Nuevo Dialog (análogo al de `credentials`): título "Contraseña asignada de {name}", `Notice kind="warning"` con texto que deje claro que es la **contraseña inicial asignada** y que **puede estar desactualizada** si la persona la cambió; mostrar la contraseña en `font-mono` y botón copiar (`Button kind="secondary" icon="copy"`). Si `assigned.password === null`: mostrar mensaje en español: "Este miembro no tiene una contraseña asignada visible (quizá la cambió). Puedes restablecerla." (sin inventar reset). Reusar `Dialog`, `Button`, `Notice`, `useToast`, `IconButton` de `@/shared/ui`. Mantener todo en español. No tocar el Dialog de `credentials` de invitación, ni el flujo del invitado, ni el sistema de permisos.
      Files: modificar `/home/miguelzambrano/projects/Qhub_Web/apps/web/src/features/team/TeamPage.tsx`
      Verify: `cd /home/miguelzambrano/projects/Qhub_Web && npm run typecheck && npm run test -w @qhub/web && npm run build` — tipos, tests y build pasan.

- [ ] 8. **(Web, opcional pero recomendado) Prueba de UI para la nueva acción.**
      No existe test dedicado de `TeamPage` hoy. Añadir uno que renderice `TeamPage` con `FakeStaffRepository` (admin), fije `repo.memberInitialPasswords['u2'] = 'Taza-azul-77'`, haga click en "Ver contraseña" del miembro `u2` y verifique que el Dialog muestra la contraseña y el aviso; y un caso con `null` que muestre el mensaje amable. Seguir el patrón de `app/invitations.test.tsx` para montar providers/container.
      Files: crear `/home/miguelzambrano/projects/Qhub_Web/apps/web/src/features/team/TeamPage.test.tsx`
      Verify: `cd /home/miguelzambrano/projects/Qhub_Web && npm run test -w @qhub/web` — el nuevo test pasa.

- [ ] 9. **Verificación integral + no regresión.**
      Confirmar que el flujo del invitado (`initialPassword(token)` → `qhub-clave {token}`) sigue idéntico, que el Dialog de invitación `credentials` sigue intacto, y que el sistema de solicitudes/permisos (`requestChange`/`respondRequest`/`spendPasswordPermission`/`usar_permiso_contrasena`) no se tocó.
      Files: n/a (revisión)
      Verify: `cd /home/miguelzambrano/projects/Qhub_Web && npm run typecheck && npm run test --workspaces --if-present && npm run build`. Edge/SQL: revisión de código (Deno/Supabase CLI ausentes en el host); dejar constancia de que la migración SQL debe aplicarse por despliegue.

## Seguridad (no comprometer)
- Admin se valida SIEMPRE server-side dentro de la RPC (`es_admin_org(p_org)` + `p_usuario` es miembro de `p_org`).
- Nunca registrar/cachear/persistir la contraseña descifrada. Se devuelve una vez, `no-store`, como hoy.
- Sin texto plano en ningún lado: solo se mueve/lee el mismo sobre AES-GCM.
- El flujo del invitado queda idéntico en comportamiento (rama `{token}` sin cambios).

## Huecos / supuestos
- **Retención:** conservar el sobre cifrado tras la aceptación es un cambio de comportamiento (antes se destruía). Es lo pedido por el usuario; si el implementador detecta que esto contradice una política, debe confirmarlo (no reintroducir borrado silenciosamente).
- Si en producción ya hay miembros que aceptaron antes de esta migración, su sobre ya se borró y `clave_inicial_de_miembro` devolverá `null` para ellos → la UI mostrará el mensaje amable. Esto es correcto y esperado.
