import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { badRequestFailure, unauthorizedFailure } from '@qhub/core';
import { AppRoutes } from '@/app/AppRoutes';
import { adminMembership, agentMembership, ana, FakeVault, org, FakeQueueRepository, FakeStaffRepository, makeQueue, MemoryTokenStore } from '@/testing/fakes';
import { makeContainer, renderWith } from '@/testing/harness';

const savedToken = () => { const s = new MemoryTokenStore(); s.save('org1', { accessToken: 'guardado', expiresIn: 3600, issuedAt: new Date() }); return s; };

describe('acceso', () => {
  it('sin sesión muestra el login y valida los campos', async () => {
    const c = makeContainer();
    const { user } = await renderWith(<AppRoutes />, c);
    expect(await screen.findByRole('heading', { name: /^Inicia sesión/  })).toBeInTheDocument();
    expect(screen.getByText('Cada turno, en su lugar.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByText('Escribe un correo válido.')).toBeInTheDocument();
    expect(screen.getByText('Escribe tu contraseña.')).toBeInTheDocument();
    expect(c.fakes.staff.calls).toEqual([]);
  });

  it('credenciales incorrectas muestran el error', async () => {
    const staff = new FakeStaffRepository(); staff.signInFailure = unauthorizedFailure('Correo o contraseña incorrectos.');
    const { user } = await renderWith(<AppRoutes />, makeContainer({ staff }));
    await user.type(await screen.findByLabelText('Correo de trabajo'), 'ana@x.co');
    await user.type(screen.getByLabelText('Contraseña'), 'secreto123');
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(await screen.findByText('Correo o contraseña incorrectos.')).toBeInTheDocument();
  });

  it('flujo completo: login → crear organización → conectar Qhub → colas', async () => {
    const c = makeContainer();
    const { user } = await renderWith(<AppRoutes />, c);
    await user.type(await screen.findByLabelText('Correo de trabajo'), 'ana@x.co');
    await user.type(screen.getByLabelText('Contraseña'), 'secreto123');
    await user.click(screen.getByRole('button', { name: 'Continuar' }));

    expect(await screen.findByText('Configura tu cuenta')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Nombre de la organización'), 'Notaría 12');
    await user.click(screen.getByRole('button', { name: /Crear organización/ }));

    expect(await screen.findByText('Conecta Notaría 12 con Qhub')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Correo o usuario de Qhub'), 'notaria12');
    await user.type(screen.getByLabelText('Contraseña'), 'clave-segura-1');
    await user.click(screen.getByRole('button', { name: /^Conectar/ }));

    expect(await screen.findByRole('heading', { level: 1, name: /Ana/ })).toBeInTheDocument();   // aterriza en el inicio
    expect(await screen.findByText('Caja 1')).toBeInTheDocument();
    expect(c.fakes.staff.calls).toContain('createOrg:Notaría 12:empresa');
    expect(c.fakes.auth.logins).toEqual(['notaria12']);
    await user.click(within(screen.getByRole('navigation', { name: 'Principal' })).getByRole('link', { name: /^Colas/ }));
    const create = await screen.findByRole('button', { name: /Crear cola/ });
    await waitFor(() => expect(create).toBeEnabled()); // es admin y hay cupo
  });

  it('una invitación inválida se explica', async () => {
    const staff = new FakeStaffRepository({ user: ana });
    const { user } = await renderWith(<AppRoutes />, makeContainer({ staff }));
    await user.click(await screen.findByRole('tab', { name: 'Tengo una invitación' }));
    await user.type(screen.getByLabelText('Código de invitación'), 'bad');
    await user.click(screen.getByRole('button', { name: /Unirme/ }));
    expect(await screen.findByText(/Invitación inválida/)).toBeInTheDocument();
  });

  it('con el token de la pestaña vigente entra directo a colas', async () => {
    const staff = new FakeStaffRepository({ user: ana, memberships: [adminMembership] });
    const c = makeContainer({ staff, tokenStore: savedToken() });
    await renderWith(<AppRoutes />, c);
    expect(await screen.findByText('Caja 1')).toBeInTheDocument();
    expect(c.fakes.auth.logins).toEqual([]); // no volvió a pedir contraseña
    expect(c.context.token).toBe('guardado');
  });

  it('si la API responde 401 la app pide conectar de nuevo', async () => {
    const staff = new FakeStaffRepository({ user: ana, memberships: [adminMembership] });
    const c = makeContainer({ staff, tokenStore: savedToken() });
    await renderWith(<AppRoutes />, c);
    await screen.findByText('Caja 1');
    c.context.onUnauthorized?.();
    expect(await screen.findByText(/Conecta Notaría 12 con Qhub/)).toBeInTheDocument();
    expect(await screen.findByText('Tu sesión venció. Inicia sesión de nuevo.')).toBeInTheDocument();
  });
});

describe('iniciar sesión nunca muestra «Configura tu cuenta» a quien ya tiene organización', () => {
  it('ni un instante, aunque las organizaciones tarden en llegar', async () => {
    class SlowStaff extends FakeStaffRepository { override async memberships() { await new Promise((r) => setTimeout(r, 60)); return super.memberships(); } }
    const staff = new SlowStaff({ memberships: [adminMembership] });
    const c = makeContainer({ staff, tokenStore: savedToken() });
    const { user, container } = await renderWith(<AppRoutes />, c);
    const seen: string[] = [];
    const watch = new MutationObserver(() => { const t = container.textContent ?? ''; if (/Configura tu cuenta/.test(t)) seen.push(t.slice(0, 40)); });
    watch.observe(container, { childList: true, subtree: true, characterData: true });
    await user.type(await screen.findByLabelText('Correo de trabajo'), 'ana@x.co');
    await user.type(screen.getByLabelText('Contraseña'), 'secreto123');
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(await screen.findByRole('heading', { level: 1, name: /Ana/ })).toBeInTheDocument();
    watch.disconnect();
    expect(seen).toEqual([]);
    expect(screen.queryByText('Configura tu cuenta')).toBeNull();
  });

  it('y quien de verdad no tiene organización sí la ve, ya con todo cargado', async () => {
    const { user } = await renderWith(<AppRoutes />, makeContainer({ staff: new FakeStaffRepository() }));
    await user.type(await screen.findByLabelText('Correo de trabajo'), 'ana@x.co');
    await user.type(screen.getByLabelText('Contraseña'), 'secreto123');
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(await screen.findByText('Configura tu cuenta')).toBeInTheDocument();
  });
});

describe('la conexión con Qhub se pide una sola vez', () => {
  const linked = (role: 'admin' | 'agente') => ({ organization: { ...org, linked: true }, role }) as const;

  it('al iniciar sesión con la conexión guardada entra directo, sin pantalla de conectar ni contraseña', async () => {
    const staff = new FakeStaffRepository({ user: ana, memberships: [linked('admin')] });
    const c = makeContainer({ staff });
    await renderWith(<AppRoutes />, c);
    expect(await screen.findByRole('heading', { level: 1, name: /Ana/ })).toBeInTheDocument();
    expect(screen.queryByText(/Conecta Notaría 12 con Qhub/)).toBeNull();
    expect(c.fakes.qhubLink.calls).toEqual(['issue:org1']); expect(c.fakes.auth.logins).toEqual([]);
    expect(await screen.findByText('Caja 1')).toBeInTheDocument();                       // y ya carga sus colas con ese token
  });

  it('un agente también entra directo: no necesita saber la contraseña de Qhub', async () => {
    const c = makeContainer({ staff: new FakeStaffRepository({ user: ana, memberships: [linked('agente')] }) });
    await renderWith(<AppRoutes />, c);
    expect(await screen.findByRole('heading', { level: 1, name: /Ana/ })).toBeInTheDocument();
  });

  it('la primera vez, un administrador conecta y la conexión queda guardada; un agente ve que debe hacerlo un administrador', async () => {
    const admin = makeContainer({ staff: new FakeStaffRepository({ user: ana, memberships: [adminMembership] }) });
    const { user } = await renderWith(<AppRoutes />, admin);
    expect(await screen.findByText(/Conecta Notaría 12 con Qhub/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Guardar la conexión: solo lo haces una vez/)).toBeChecked();
    await user.type(screen.getByLabelText('Correo o usuario de Qhub'), 'notaria12'); await user.type(screen.getByLabelText('Contraseña'), 'clave-segura-1');
    await user.click(screen.getByRole('button', { name: /^Conectar/ }));
    expect(await screen.findByRole('heading', { level: 1, name: /Ana/ })).toBeInTheDocument();
    expect(admin.fakes.qhubLink.calls).toContain('connect:org1:notaria12');
  });
  it('si el servidor no puede guardarla, queda en este dispositivo y se avisa; la siguiente vez entra directo', async () => {
    const vault = new FakeVault();
    const first = makeContainer({ staff: new FakeStaffRepository({ user: ana, memberships: [adminMembership] }), vault });
    first.fakes.qhubLink.connectFailure = badRequestFailure('El servicio de turnos no está configurado todavía');
    const a = await renderWith(<AppRoutes />, first);
    await a.user.type(await screen.findByLabelText('Correo o usuario de Qhub'), 'notaria12'); await a.user.type(screen.getByLabelText('Contraseña'), 'clave-segura-1');
    await a.user.click(screen.getByRole('button', { name: /^Conectar/ }));
    expect(await screen.findByRole('heading', { level: 1, name: /Ana/ })).toBeInTheDocument();
    expect(await screen.findByText(/Guardamos la conexión en este dispositivo/)).toBeInTheDocument();
    a.unmount();

    // otra sesión (token de la pestaña vacío): no aparece la pantalla de conectar
    const next = makeContainer({ staff: new FakeStaffRepository({ user: ana, memberships: [adminMembership] }), vault });
    await renderWith(<AppRoutes />, next);
    expect(await screen.findByRole('heading', { level: 1, name: /Ana/ })).toBeInTheDocument();
    expect(screen.queryByText(/Conecta Notaría 12 con Qhub/)).toBeNull(); expect(next.fakes.auth.logins).toEqual(['notaria12']);
  });

  it('si no se puede guardar en ningún lado, se avisa', async () => {
    const admin = makeContainer({ staff: new FakeStaffRepository({ user: ana, memberships: [adminMembership] }) });
    admin.fakes.qhubLink.connectFailure = badRequestFailure('x'); admin.fakes.vault.supported = false;
    const { user } = await renderWith(<AppRoutes />, admin);
    await user.type(await screen.findByLabelText('Correo o usuario de Qhub'), 'notaria12'); await user.type(screen.getByLabelText('Contraseña'), 'clave-segura-1');
    await user.click(screen.getByRole('button', { name: /^Conectar/ }));
    expect(await screen.findByRole('heading', { level: 1, name: /Ana/ })).toBeInTheDocument();
    expect(await screen.findByText(/no pudimos guardar la conexión para la próxima vez/)).toBeInTheDocument();
  });
  it('un agente sin conexión guardada ve el aviso; si conecta, queda guardada solo en su dispositivo', async () => {
    const c = makeContainer({ staff: new FakeStaffRepository({ user: ana, memberships: [agentMembership] }) });
    const { user } = await renderWith(<AppRoutes />, c);
    expect(await screen.findByText('Un administrador debe conectar la cuenta con Qhub.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Correo o usuario de Qhub'), 'notaria12'); await user.type(screen.getByLabelText('Contraseña'), 'clave-segura-1');
    await user.click(screen.getByRole('button', { name: /^Conectar/ }));
    await screen.findByRole('heading', { level: 1, name: /Ana/ });
    expect(c.fakes.qhubLink.calls).toEqual([]); expect(c.fakes.vault.data.has('org1')).toBe(true);
  });

  it('si la contraseña guardada ya no sirve, se explica y se pide conectar de nuevo', async () => {
    const c = makeContainer({ staff: new FakeStaffRepository({ user: ana, memberships: [linked('admin')] }) });
    c.fakes.qhubLink.issueFailure = unauthorizedFailure('La contraseña de Qhub que teníamos guardada ya no es válida. Conecta tu cuenta de nuevo.');
    await renderWith(<AppRoutes />, c);
    expect(await screen.findByText(/Conecta Notaría 12 con Qhub/)).toBeInTheDocument();
    expect(screen.getByText(/ya no es válida/)).toBeInTheDocument();
  });
});

describe('la pantalla de conectar solo sale la primera vez (lo decide la base de datos)', () => {
  const confirmed = (role: 'admin' | 'agente') => ({ organization: { ...org, qhubConnected: true }, role }) as const;

  it('la primera vez, un administrador conecta y queda registrado: la siguiente sesión no vuelve a mostrarla', async () => {
    const staff = new FakeStaffRepository({ user: ana, memberships: [adminMembership] });
    const first = makeContainer({ staff });
    const a = await renderWith(<AppRoutes />, first);
    expect(await screen.findByText(/Conecta Notaría 12 con Qhub/)).toBeInTheDocument();
    await a.user.type(screen.getByLabelText('Correo o usuario de Qhub'), 'notaria12'); await a.user.type(screen.getByLabelText('Contraseña'), 'clave-segura-1');
    await a.user.click(screen.getByRole('button', { name: /^Conectar/ }));
    await screen.findByRole('heading', { level: 1, name: /Ana/ });
    expect(staff.calls).toContain('confirmQhub:org1');
    a.unmount();
    // sesión nueva: sin token, sin conexión guardada en el servidor ni en el dispositivo; igual no aparece la pantalla de conectar
    const second = makeContainer({ staff, vault: new FakeVault() });
    await renderWith(<AppRoutes />, second);
    expect(await screen.findByRole('heading', { level: 1, name: /Ana/ })).toBeInTheDocument();
    expect(screen.queryByText(/Conecta Notaría 12 con Qhub/)).toBeNull();
  });

  it('con la conexión ya confirmada y sin token, la app abre y avisa dentro de la pantalla; se reconecta en una ventana', async () => {
    const c = makeContainer({ staff: new FakeStaffRepository({ user: ana, memberships: [confirmed('admin')] }) });
    const { user } = await renderWith(<AppRoutes />, c);
    expect(await screen.findByRole('heading', { level: 1, name: /Ana/ })).toBeInTheDocument();
    expect(screen.queryByText(/Conecta Notaría 12 con Qhub/)).toBeNull();
    expect(await screen.findByText('Falta reconectar con Qhub')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reconectar' }));
    const dlg = await screen.findByRole('dialog', { name: 'Reconectar con Qhub' });
    c.fakes.auth.loginFailure = unauthorizedFailure('Credenciales inválidas');
    await user.type(within(dlg).getByLabelText('Correo o usuario de Qhub'), 'notaria12'); await user.type(within(dlg).getByLabelText('Contraseña'), 'mala');
    await user.click(within(dlg).getByRole('button', { name: 'Conectar' }));
    expect(await within(dlg).findByText('Credenciales inválidas')).toBeInTheDocument();      // el error sale en la ventana, que sigue abierta
    c.fakes.auth.loginFailure = null;
    await user.clear(within(dlg).getByLabelText('Contraseña')); await user.type(within(dlg).getByLabelText('Contraseña'), 'buena-1234');
    await user.click(within(dlg).getByRole('button', { name: 'Conectar' }));
    await waitFor(() => expect(screen.queryByText('Falta reconectar con Qhub')).toBeNull());
    expect(c.fakes.qhubLink.calls).toContain('connect:org1:notaria12');       // guardada (en el servidor, por ser administrador) para no pedirla más
  });

  it('un agente con la conexión confirmada también entra y ve el aviso (no la pantalla completa)', async () => {
    const c = makeContainer({ staff: new FakeStaffRepository({ user: ana, memberships: [confirmed('agente')] }) });
    await renderWith(<AppRoutes />, c);
    expect(await screen.findByRole('heading', { level: 1, name: /Ana/ })).toBeInTheDocument();
    expect(await screen.findByText('Falta reconectar con Qhub')).toBeInTheDocument();
  });

  it('con la conexión confirmada y guardada, entra sin ningún aviso', async () => {
    const c = makeContainer({ staff: new FakeStaffRepository({ user: ana, memberships: [{ organization: { ...org, qhubConnected: true, linked: true }, role: 'admin' }] }) });
    await renderWith(<AppRoutes />, c);
    expect(await screen.findByRole('heading', { level: 1, name: /Ana/ })).toBeInTheDocument();
    expect(screen.queryByText('Falta reconectar con Qhub')).toBeNull();
  });
});

describe('página 404', () => {
  it('una dirección que no existe muestra la 404 con la marca y la salida al inicio, sin repetir lo escrito', async () => {
    const staff = new FakeStaffRepository({ user: ana, memberships: [adminMembership] });
    const { user } = await renderWith(<AppRoutes />, makeContainer({ staff, tokenStore: savedToken() }), '/esto/no<script>existe');
    expect(await screen.findByRole('heading', { level: 1, name: 'Este no es el turno que buscas' })).toBeInTheDocument();
    expect(screen.getAllByRole('img', { name: 'Qhub' }).length).toBeGreaterThan(1);          // el logo de la cabecera y el símbolo de la 404
    expect(document.body.textContent).not.toMatch(/esto\/no|script/);
    expect(screen.getByRole('navigation', { name: 'Principal' })).toBeInTheDocument();      // sigue dentro de la app
    await user.click(screen.getByRole('button', { name: 'Ir al inicio' }));
    expect(await screen.findByRole('heading', { level: 1, name: /Ana/ })).toBeInTheDocument();
  });

  it('sin sesión, una dirección desconocida lleva al acceso (no revela qué páginas existen)', async () => {
    await renderWith(<AppRoutes />, makeContainer(), '/administracion/secreta');
    expect(await screen.findByRole('heading', { name: /^Inicia sesión/ })).toBeInTheDocument();
    expect(screen.queryByText('Este no es el turno que buscas')).toBeNull();
  });
});

describe('roles', () => {
  it('el agente ve la operación pero no la administración', async () => {
    const staff = new FakeStaffRepository({ user: ana, memberships: [agentMembership] });
    await renderWith(<AppRoutes />, makeContainer({ staff, tokenStore: savedToken() }), '/colas');
    await screen.findByText('Caja 1');
    const nav = screen.getByRole('navigation', { name: 'Principal' });
    expect(nav).toHaveTextContent('En vivo');
    expect(nav).toHaveTextContent('Historial');
    expect(nav).not.toHaveTextContent('Equipo');
    expect(nav).not.toHaveTextContent('Ajustes');
    expect(screen.queryByRole('button', { name: /Crear cola/ })).toBeNull();
  });

  it('el agente que escribe una URL de administración vuelve al inicio', async () => {
    const staff = new FakeStaffRepository({ user: ana, memberships: [agentMembership] });
    await renderWith(<AppRoutes />, makeContainer({ staff, tokenStore: savedToken() }), '/equipo');
    expect(await screen.findByText('Caja 1')).toBeInTheDocument();
    expect(screen.queryByText('Invitar a alguien')).toBeNull();
  });

  it('el admin ve Equipo y puede invitar', async () => {
    const staff = new FakeStaffRepository({ user: ana, memberships: [adminMembership] });
    const { user } = await renderWith(<AppRoutes />, makeContainer({ staff, tokenStore: savedToken() }));
    await screen.findByText('Caja 1');
    await user.click(within(screen.getByRole('navigation', { name: 'Principal' })).getByRole('link', { name: /Equipo/ }));
    expect(await screen.findByText('Ana Gómez (tú)')).toBeInTheDocument();
    expect(screen.getByText('Luis Vera')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Correo'), 'nuevo@x.co');
    await user.click(screen.getByRole('button', { name: /Enviar invitación/ }));
    await waitFor(() => expect(staff.calls).toContain('invite:nuevo@x.co:agente'));
    expect(await screen.findByText('nuevo@x.co')).toBeInTheDocument();
  });

  it('límite de colas alcanzado deshabilita "Crear cola" y avisa', async () => {
    const staff = new FakeStaffRepository({ user: ana, memberships: [adminMembership] });
    const queues = new FakeQueueRepository(); queues.limitValue = { accountType: 'empresa', limit: 6, active: 6, available: 0 };
    await renderWith(<AppRoutes />, makeContainer({ staff, queues, tokenStore: savedToken() }), '/colas');
    expect(await screen.findByText(/Llegaste al límite de colas \(6\)/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Crear cola/ })).toBeDisabled();
  });

  it('archivadas se ven en su pestaña', async () => {
    const staff = new FakeStaffRepository({ user: ana, memberships: [adminMembership] });
    const queues = new FakeQueueRepository([makeQueue('q1', 'Caja 1'), makeQueue('q2', 'Archivo viejo', false)]);
    const { user } = await renderWith(<AppRoutes />, makeContainer({ staff, queues, tokenStore: savedToken() }), '/colas');
    await screen.findByText('Caja 1');
    await user.click(screen.getByRole('tab', { name: /Archivadas/ }));
    expect(screen.getByText('Archivo viejo')).toBeInTheDocument();
    expect(screen.queryByText('Caja 1')).toBeNull();
  });
});
