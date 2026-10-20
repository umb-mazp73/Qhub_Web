# Implementation Plan — Post-accept credentials MOMENT modal (invited person)

## Goal

After the invited person clicks "Aceptar invitación" and `acceptInvitation` succeeds, if an
assigned initial password exists in memory, show a MOMENT modal (a `Dialog`, not a persisted
notification) that mirrors the admin's "Invitación enviada" modal in `TeamPage.tsx`: a warning
`Notice`, a Correo + Contraseña `<dl>`, and a "Copiar datos" button. The modal's dismiss button is
what then navigates to `/inicio` and clears the pending invitation. If the password is null,
navigate to `/inicio` immediately (today's behavior).

This is Option B, confirmed with the user. It is MOMENT-only: no new persistence of the password
anywhere (no `notificaciones_staff` row, no storage). Only the already-fetched in-memory `password`
value is reused. Supabase, `.env`, the admin modal (`TeamPage.tsx`), and mobile are OUT OF SCOPE.

## Confirmed code facts (verified during exploration)

- `apps/web/src/features/invitation/InvitationPage.tsx` is the invited person's screen. It reads
  the preview via `staff.previewInvitation(token)` into `const p = preview.data` (email is
  `p.email`), and the assigned initial password via `staff.initialPassword(token)` into
  `const password = clave.data ?? null`. Today `accept()` does: block if `password && !saved`; call
  `staff.acceptInvitation(token)`; on success `await session.loadMemberships()`, then
  `nav('/inicio', { replace: true })` and `clearInvitation()`.
- The pre-accept inline block titled "Esta es tu contraseña" (with "Copiar contraseña" button and
  the "Ya la copié y la guardé" `Checkbox` gating `saved`) renders only when `password` is truthy.
- The admin modal to mirror is the `credentials` `Dialog` in `apps/web/src/features/team/TeamPage.tsx`
  titled "Invitación enviada": `<Notice kind="warning" title="Guarda esta contraseña ahora." .../>`,
  a `<dl className="m-0 grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 border border-border-subtle bg-layer-02 p-4">`
  with Correo + Contraseña rows (the Contraseña `dd` uses `font-mono`), and a
  `<Button kind="secondary" icon="copy">Copiar datos</Button>` that copies
  `` `Correo: ${email}\nContraseña: ${password}` `` and toasts "Datos copiados." Do NOT modify TeamPage.tsx.
- `Dialog` signature (`apps/web/src/shared/ui/display.tsx`): `{ title, children, actions, onClose, wide? }`.
  `Notice` signature: `{ kind?, title, message?, action? }`. Both already imported in InvitationPage
  (`Button, Checkbox, Icon, Logo, Notice, Panel, Skeleton, useToast` from `@/shared/ui`).
- The REAL accept-flow tests are in `apps/web/src/app/invitations.test.tsx`, NOT in
  `profile-and-access.test.tsx` (that file covers recovery/registration/profile and does not accept
  an invitation). `invitations.test.tsx` defines `TOKEN`, `preview` (email `ana@x.co`), and
  `savedToken()`, and drives `FakeStaffRepository` via `staff.previews[TOKEN]` and
  `staff.initialPasswords[TOKEN]`. `acceptInvitation` pushes `accept:${token}` to `staff.calls`.
- Root verification commands exist: `npm run typecheck` and `npm run test` (package.json at repo root,
  npm workspaces). No AGENTS.md/CONTRIBUTING in the repo.

## Decisions

- PRE-ACCEPT BLOCK (resolved): KEEP the existing inline "Esta es tu contraseña" block exactly as is,
  including the "Ya la copié y la guardé" gate. Rationale: it lets the user save before accepting
  (the gate must still block `accept()` when `password` exists and `saved` is false), and the new
  post-accept modal is an additional, last-chance reminder — the two are complementary, not
  redundant. This matches the user's preferred option in the brief.
- NAVIGATION TIMING (resolved): move `nav('/inicio', { replace: true })` + `clearInvitation()` OUT of
  `accept()` into the modal's dismiss handler, but ONLY for the password-present path. When
  `password` is null, `accept()` navigates immediately as today (no modal). Rationale: the modal is
  the user's chance to copy credentials; navigating only on dismiss guarantees they see it.
- PRESERVING THE EXISTING "al aceptar entra" TEST: that test (no `initialPasswords[TOKEN]`, so
  `password` is null) hits the null-password path and still navigates immediately — it stays green
  unchanged. The "muestra la contraseña ... pide confirmar que la guardó" test sets
  `initialPasswords[TOKEN]`; it only asserts `accept:${TOKEN}` was called (not navigation), so it
  stays green — the new modal simply appears afterward. No existing assertion contradicts the new
  behavior, so existing tests are NOT modified.

## Implementation steps

- [ ] 1. Add post-accept modal state and rework `accept()` in InvitationPage.
      In `apps/web/src/features/invitation/InvitationPage.tsx`, add a state flag to drive the modal,
      e.g. `const [showDatos, setShowDatos] = useState(false);`. In `accept()`, keep the existing
      guard (`if (password && !saved) { setError(...); return; }`), the `setBusy(true)`, the
      `staff.acceptInvitation(token)` call, its failure handling, and `await session.loadMemberships()`
      and `setBusy(false)`. Then REPLACE the trailing `nav('/inicio', { replace: true }); clearInvitation();`
      with: `if (password) { setShowDatos(true); } else { nav('/inicio', { replace: true }); clearInvitation(); }`.
      Add a dismiss handler `const finishInvite = () => { setShowDatos(false); nav('/inicio', { replace: true }); clearInvitation(); };`.
      Leave `decline` and `switchAccount` unchanged.
      Files: apps/web/src/features/invitation/InvitationPage.tsx
      Verify: `npm run typecheck` passes (no unused vars / type errors).

- [ ] 2. Render the MOMENT modal mirroring the admin "Invitación enviada" Dialog.
      Inside the `p`-present branch of the returned JSX (after the existing `<Button ...>Ahora no</Button>`
      is fine, or alongside the other content — it is conditionally rendered so placement is free),
      add: `{showDatos && password && (<Dialog title="¡Bienvenido/a! Estos son tus datos" onClose={finishInvite} actions={<Button onClick={finishInvite}>Listo</Button>}> ...body... </Dialog>)}`.
      Body mirrors the admin modal classes exactly:
      `<div className="flex flex-col gap-3">` containing
      (a) `<Notice kind="warning" title="Guarda esta contraseña ahora." message="Es la única vez que se muestra: no la guardamos. Pégala en un lugar seguro, como un gestor de contraseñas." />`;
      (b) `<dl className="m-0 grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 border border-border-subtle bg-layer-02 p-4"><dt className="t-caption text-text-secondary">Correo</dt><dd className="m-0 truncate">{p.email}</dd><dt className="t-caption text-text-secondary">Contraseña</dt><dd className="m-0 font-mono">{password}</dd></dl>`;
      (c) `<div><Button kind="secondary" icon="copy" onClick={async () => { await navigator.clipboard?.writeText(`Correo: ${p.email}\nContraseña: ${password}`); toast.show('Datos copiados.'); }}>Copiar datos</Button></div>`.
      Use `p.email` for the email and the in-memory `password` for the password. Do NOT introduce any
      new repository call, storage write, or notification — reuse only existing in-memory values.
      Files: apps/web/src/features/invitation/InvitationPage.tsx
      Verify: `npm run typecheck` passes.

- [ ] 3. Add tests for the post-accept modal in the existing invitation test file.
      In `apps/web/src/app/invitations.test.tsx`, inside the `describe('invitación: llegar desde el
      botón del correo', ...)` block, add two `it` cases using the existing `TOKEN`, `preview`,
      `savedToken()`, `FakeStaffRepository`, `makeContainer`, `renderWith` style and the
      `staff.previews[TOKEN]` / `staff.initialPasswords[TOKEN]` fakes:
      (a) "al aceptar con contraseña asignada muestra los datos como un momento y recién al cerrar
      entra": set `staff.previews[TOKEN] = preview; staff.initialPasswords[TOKEN] = 'Taza-azul-77';`
      render at `/invitacion?token=${TOKEN}` with `tokenStore: savedToken()` and
      `memberships: [adminMembership]` or `[]` (match the existing accept test's membership setup so
      the post-accept redirect resolves); click the "Ya la copié y la guardé" checkbox, click
      "Aceptar invitación"; `await waitFor(() => expect(staff.calls).toContain(`accept:${TOKEN}`))`;
      then assert the modal: `expect(await screen.findByText('¡Bienvenido/a! Estos son tus datos')).toBeInTheDocument();`
      the correo `ana@x.co` and password `Taza-azul-77` are shown, and the "Copiar datos" button
      exists; assert navigation has NOT happened yet (e.g. `expect(screen.queryByRole('navigation', { name: 'Principal' })).toBeNull();`);
      then click "Listo" and assert `await screen.findByRole('navigation', { name: 'Principal' })`
      appears and `pendingInvitation()` is null.
      (b) "sin contraseña asignada entra directo sin mostrar los datos": set only
      `staff.previews[TOKEN] = preview` (no `initialPasswords`); click "Aceptar invitación";
      `await waitFor(() => expect(staff.calls).toContain(`accept:${TOKEN}`))`; assert the modal title
      is absent (`expect(screen.queryByText('¡Bienvenido/a! Estos son tus datos')).toBeNull();`) and
      the app navigated (`await screen.findByRole('navigation', { name: 'Principal' })`).
      Scope the title query so it does not collide with the pre-accept "Esta es tu contraseña" block.
      Files: apps/web/src/app/invitations.test.tsx
      Verify: `npm run test` passes, including the two new cases.

- [ ] 4. Full verification.
      Run the project's real build/test gates from the repo root
      `/home/miguelzambrano/projects/Qhub_Web`.
      Files: (none — verification only)
      Verify: `npm run typecheck` passes with no errors, and `npm run test` passes with ALL vitest
      tests green — specifically the existing `apps/web/src/app/invitations.test.tsx` cases (the
      "al aceptar entra" null-password case and the "muestra la contraseña" case) remain green, plus
      the two new modal cases pass. `apps/web/src/app/profile-and-access.test.tsx` must also remain
      green (it is unaffected: it does not accept an invitation).

## Notes / assumptions

- The task brief names `profile-and-access.test.tsx` as the invitation-accept test, but exploration
  shows the invitation-accept tests actually live in `apps/web/src/app/invitations.test.tsx`. The
  new tests are added there (the correct, real location). `profile-and-access.test.tsx` is left
  untouched and must stay green. If the implementer finds any accept-navigation assertion in
  `profile-and-access.test.tsx`, update it to mirror the real new timing — but none exists today, so
  no change is expected.
- Keep all UI copy in clean Spanish. Do not alter the pre-accept inline password block or its gate.
- Do not add or modify any repository method, storage, Supabase, `.env`, mobile code, or `TeamPage.tsx`.

## Verification (iteration 1)

Commands run from the repo root `/home/miguelzambrano/projects/Qhub_Web`:

- `npm run typecheck` -> exit code 0 (all 4 workspaces: @qhub/api-client, @qhub/core, @qhub/design, @qhub/web, no errors).
- `npm run test` -> exit code 0. 31 test files passed, 234 tests passed, 0 failed.
  - `apps/web/src/app/invitations.test.tsx`: 12 tests green, including the two NEW cases
    ("al aceptar con contraseña asignada muestra los datos como un momento y recién al cerrar entra"
    and "sin contraseña asignada entra directo sin mostrar los datos"), and the pre-existing
    "al aceptar entra" (null-password) and "muestra la contraseña ... pide confirmar que la guardó"
    cases remain green unchanged.
  - `apps/web/src/app/profile-and-access.test.tsx` remains green (untouched; it does not accept an
    invitation).

Implementation summary: in `apps/web/src/features/invitation/InvitationPage.tsx` added a `showDatos`
state; `accept()` now opens the MOMENT `Dialog` (mirroring TeamPage's `credentials` Dialog markup and
classes) instead of navigating when `password` is non-null, and the Dialog's `onClose`/`Listo` button
run `finishInvite()` (nav to `/inicio` + `clearInvitation()`). Null-password path navigates
immediately as before. No persistence of the password; only the in-memory `password` is reused. The
pre-accept "Esta es tu contraseña" block and its "Ya la copié y la guardé" gate are unchanged.
