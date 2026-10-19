import { describe, expect, it } from 'vitest';
import { notFoundFailure, unauthorizedFailure } from '@qhub/core';
import { adminMembership, agentMembership, ana, FakeAuthRepository, FakeStaffRepository, FakeVault, MemoryTokenStore, org } from '@/testing/fakes';
import { makeContainer } from '@/testing/harness';

const flush = () => new Promise((r) => setTimeout(r, 0));

async function ready(role: 'admin' | 'agente' = 'agente') {
  const staff = new FakeStaffRepository({ user: ana, memberships: [role === 'admin' ? adminMembership : agentMembership] });
  const c = makeContainer({ staff, auth: new FakeAuthRepository(), tokenStore: new MemoryTokenStore() });
  c.session.start();
  await flush(); await flush();
  return c;
}

describe('AppSession', () => {
  it('carga usuario y organización', async () => {
    const c = await ready();
    expect(c.session.user?.id).toBe('u1');
    expect(c.session.membership?.role).toBe('agente');
    expect(c.session.getSnapshot().connection.status).toBe('disconnected');
  });
  it('connect deja el token y el actor con el rol del staff y guarda el token de la pestaña', async () => {
    const c = await ready();
    const r = await c.session.connect('notaria12', 'pw');
    expect(r.ok).toBe(true);
    expect(c.context.token).toBe('tok1');
    expect(c.context.actor).toEqual({ userId: 'u1', role: 'agente' });
    expect(c.fakes.tokenStore.data.get('org1')?.accessToken).toBe('tok1');
  });
  it('credenciales inválidas → disconnected con el motivo', async () => {
    const c = await ready();
    c.fakes.auth.loginFailure = unauthorizedFailure('Credenciales inválidas');
    const r = await c.session.connect('x', 'y');
    expect(r.ok).toBe(false);
    const s = c.session.getSnapshot().connection;
    expect(s.status === 'disconnected' && s.reason?.message).toBe('Credenciales inválidas');
    expect(c.context.token).toBeNull();
  });
  it('restaura el token guardado si sigue vigente; si venció lo descarta', async () => {
    const store = new MemoryTokenStore();
    store.save('org1', { accessToken: 'guardado', expiresIn: 3600, issuedAt: new Date() });
    const staff = new FakeStaffRepository({ user: ana, memberships: [agentMembership] });
    const c = makeContainer({ staff, tokenStore: store });
    c.session.start(); await flush(); await flush();
    expect(c.session.getSnapshot().connection.status).toBe('connected');
    expect(c.context.token).toBe('guardado');

    const old = new MemoryTokenStore();
    old.save('org1', { accessToken: 'viejo', expiresIn: 60, issuedAt: new Date(Date.now() - 3_600_000) });
    const c2 = makeContainer({ staff: new FakeStaffRepository({ user: ana, memberships: [agentMembership] }), tokenStore: old });
    c2.session.start(); await flush(); await flush();
    expect(c2.session.getSnapshot().connection.status).toBe('disconnected');
    expect(old.data.size).toBe(0);
  });
  it('un 401 del negocio desconecta y pide conectar de nuevo (no hay refresh)', async () => {
    const c = await ready();
    await c.session.connect('notaria12', 'pw');
    c.context.onUnauthorized?.();
    await flush();
    expect(c.session.getSnapshot().connection.status).toBe('disconnected');
    expect(c.context.token).toBeNull();
    expect(c.fakes.tokenStore.data.size).toBe(0);
  });
  it('cerrar sesión desconecta la API', async () => {
    const c = await ready();
    await c.session.connect('notaria12', 'pw');
    await c.session.signOut(); await flush();
    expect(c.session.getSnapshot().connection.status).toBe('disconnected');
    expect(c.session.user).toBeNull();
  });
  it('la contraseña de Qhub nunca se guarda en el navegador', async () => {
    const c = await ready();
    await c.session.connect('notaria12', 'S3cret-pw');
    expect(JSON.stringify([...c.fakes.tokenStore.data.values()])).not.toContain('S3cret-pw');
  });
});

describe('conexión con Qhub guardada en el servidor (una sola vez)', () => {
  const linkedAs = (role: 'admin' | 'agente', linked = true) => ({ organization: { ...org, linked }, role }) as const;
  const boot = async (m: ReturnType<typeof linkedAs>, tokenStore = new MemoryTokenStore()) => {
    const c = makeContainer({ staff: new FakeStaffRepository({ user: ana, memberships: [m] }), auth: new FakeAuthRepository(), tokenStore });
    c.session.start(); await flush(); await flush(); await flush();
    return c;
  };

  it('con la conexión guardada entra sola: pide el token al servidor y no inicia sesión en la API', async () => {
    const c = await boot(linkedAs('agente'));
    expect(c.session.getSnapshot().connection.status).toBe('connected');
    expect(c.fakes.qhubLink.calls).toEqual(['issue:org1']);
    expect(c.context.token).toBe('servidor-1');
    expect(c.context.actor).toEqual({ userId: 'u1', role: 'agente' });
    expect(c.fakes.auth.logins).toEqual([]);                               // nadie escribió la contraseña
    expect(c.fakes.tokenStore.data.get('org1')?.accessToken).toBe('servidor-1');
  });

  it('si ya hay un token vigente en la pestaña no vuelve a pedirlo', async () => {
    const store = new MemoryTokenStore(); store.save('org1', { accessToken: 'guardado', expiresIn: 3600, issuedAt: new Date() });
    const c = await boot(linkedAs('admin'), store);
    expect(c.context.token).toBe('guardado'); expect(c.fakes.qhubLink.calls).toEqual([]);
  });

  it('sin conexión guardada pide conectar (sin ruido); con la contraseña guardada vencida explica el motivo', async () => {
    const a = await boot(linkedAs('admin', false));
    expect(a.session.getSnapshot().connection).toEqual({ status: 'disconnected' }); expect(a.fakes.qhubLink.calls).toEqual([]);

    const staff = new FakeStaffRepository({ user: ana, memberships: [linkedAs('admin')] });
    const c = makeContainer({ staff }); c.fakes.qhubLink.issueFailure = unauthorizedFailure('La contraseña de Qhub que teníamos guardada ya no es válida.');
    c.session.start(); await flush(); await flush(); await flush();
    const conn = c.session.getSnapshot().connection;
    expect(conn.status).toBe('disconnected'); expect(conn.status === 'disconnected' && conn.reason?.message).toMatch(/ya no es válida/);

    const d = makeContainer({ staff: new FakeStaffRepository({ user: ana, memberships: [linkedAs('admin')] }) }); d.fakes.qhubLink.issueFailure = notFoundFailure('x');
    d.session.start(); await flush(); await flush(); await flush();
    expect(d.session.getSnapshot().connection).toEqual({ status: 'disconnected' });       // el servidor no tenía conexión: se pide conectar, sin error
  });

  it('al conectar a mano un administrador guarda la conexión (salvo que lo desmarque); un agente no puede', async () => {
    const a = await boot(linkedAs('admin', false));
    expect(await a.session.connect('notaria12', 'pw')).toMatchObject({ ok: true, saved: 'servidor' });
    expect(a.fakes.qhubLink.calls).toContain('connect:org1:notaria12'); expect(a.fakes.vault.data.size).toBe(0);
    const b = await boot(linkedAs('admin', false));
    expect(await b.session.connect('notaria12', 'pw', { remember: false })).toMatchObject({ ok: true, saved: false });
    expect(b.fakes.qhubLink.calls).toEqual([]); expect(b.fakes.vault.data.size).toBe(0);
    const g = await boot(linkedAs('agente', false));                    // un agente no guarda en el servidor: queda en su dispositivo
    expect(await g.session.connect('notaria12', 'pw')).toMatchObject({ ok: true, saved: 'dispositivo' });
    expect(g.fakes.qhubLink.calls).toEqual([]); expect(g.fakes.vault.data.get('org1')).toEqual({ identifier: 'notaria12', password: 'pw' });
  });

  it('si el servidor no puede guardarla (p. ej. no alcanza la API), queda cifrada en este dispositivo; si tampoco, igual queda conectado en esta sesión', async () => {
    const c = await boot(linkedAs('admin', false));
    c.fakes.qhubLink.connectFailure = unauthorizedFailure('x');
    expect(await c.session.connect('notaria12', 'pw')).toMatchObject({ ok: true, saved: 'dispositivo' });
    const d = await boot(linkedAs('admin', false));
    d.fakes.qhubLink.connectFailure = unauthorizedFailure('x'); d.fakes.vault.supported = false;
    expect(await d.session.connect('notaria12', 'pw')).toMatchObject({ ok: true, saved: false });
    expect(d.session.getSnapshot().connection.status).toBe('connected');
  });

  it('la conexión guardada en el dispositivo entra sola en la sesión siguiente, sin pedir nada', async () => {
    const vault = new FakeVault();
    const first = makeContainer({ staff: new FakeStaffRepository({ user: ana, memberships: [linkedAs('admin', false)] }), vault });
    first.fakes.qhubLink.connectFailure = unauthorizedFailure('x');
    first.session.start(); await flush(); await flush(); await first.session.connect('notaria12', 'clave-1');
    const next = makeContainer({ staff: new FakeStaffRepository({ user: ana, memberships: [linkedAs('admin', false)] }), vault, auth: new FakeAuthRepository() });
    next.session.start(); await flush(); await flush(); await flush(); await flush();
    expect(next.session.getSnapshot().connection.status).toBe('connected');
    expect(next.fakes.auth.logins).toEqual(['notaria12']); expect(next.fakes.qhubLink.calls).toEqual([]);   // organización sin conexión en el servidor: ni se intenta
  });

  it('si la contraseña guardada en el dispositivo dejó de servir, se descarta y se pide conectar con el motivo', async () => {
    const vault = new FakeVault(); vault.data.set('org1', { identifier: 'notaria12', password: 'vieja' });
    const auth = new FakeAuthRepository(); auth.loginFailure = unauthorizedFailure('x');
    const c = makeContainer({ staff: new FakeStaffRepository({ user: ana, memberships: [linkedAs('admin', false)] }), vault, auth });
    c.session.start(); await flush(); await flush(); await flush(); await flush();
    const conn = c.session.getSnapshot().connection;
    expect(conn.status).toBe('disconnected'); expect(conn.status === 'disconnected' && conn.reason?.message).toMatch(/ya no es válida/); expect(vault.data.size).toBe(0);
  });

  it('olvidar la conexión del dispositivo la borra y desconecta', async () => {
    const vault = new FakeVault(); vault.data.set('org1', { identifier: 'n', password: 'p' });
    const c = makeContainer({ staff: new FakeStaffRepository({ user: ana, memberships: [linkedAs('admin', false)] }), vault });
    c.session.start(); await flush(); await flush(); await flush(); await flush();
    expect(await c.session.hasDeviceConnection()).toBe(true);
    await c.session.forgetDeviceConnection();
    expect(vault.data.size).toBe(0); expect(c.session.getSnapshot().connection.status).toBe('disconnected');
  });

  it('cuando el token vence (401) se renueva solo y la app vuelve a pedir sus datos', async () => {
    const c = await boot(linkedAs('agente'));
    let again = 0; c.session.onReconnected = () => { again++; };
    c.context.onUnauthorized?.(); await flush(); await flush();
    expect(c.session.getSnapshot().connection.status).toBe('connected');
    expect(c.fakes.qhubLink.calls).toEqual(['issue:org1', 'issue:org1']); expect(c.context.token).toBe('servidor-2'); expect(again).toBe(1);
  });

  it('si no hay conexión guardada, un 401 pide conectar; si renovar falla, también', async () => {
    const plain = makeContainer({ staff: new FakeStaffRepository({ user: ana, memberships: [linkedAs('admin', false)] }) });
    plain.session.start(); await flush(); await flush(); await plain.session.connect('n', 'p', { remember: false });
    plain.context.onUnauthorized?.(); await flush();
    expect(plain.session.getSnapshot().connection.status).toBe('disconnected');

    const c = await boot(linkedAs('agente'));
    c.fakes.qhubLink.issueFailure = unauthorizedFailure('x');
    c.context.onUnauthorized?.(); await flush(); await flush();
    expect(c.session.getSnapshot().connection.status).toBe('disconnected');
  });
});

describe('al iniciar sesión nunca hay un estado «con sesión, sin organizaciones» mientras llegan', () => {
  /** Estados que haría que la puerta de acceso mande a «Configura tu cuenta» aunque la persona ya tenga organización. */
  const risky = (c: ReturnType<typeof makeContainer>) => {
    const bad: string[] = [];
    c.session.subscribe(() => {
      const s = c.session.getSnapshot();
      const signedIn = s.auth.status === 'ready' && s.auth.value !== null;
      const loadingSomething = s.mfa === 'checking' || s.memberships.status === 'loading';
      const emptyReady = s.memberships.status === 'ready' && s.memberships.value.length === 0;
      if (signedIn && emptyReady && !loadingSomething) bad.push(JSON.stringify({ mfa: s.mfa, memberships: s.memberships.status }));
    });
    return bad;
  };
  class SlowStaff extends FakeStaffRepository { override async memberships() { await new Promise((r) => setTimeout(r, 30)); return super.memberships(); } }

  it('sin verificación en dos pasos', async () => {
    const c = makeContainer({ staff: new SlowStaff({ memberships: [adminMembership] }) });
    c.session.start(); await flush();
    const bad = risky(c);
    await c.fakes.staff.signIn('ana@x.co');
    await new Promise((r) => setTimeout(r, 120));
    expect(c.session.membership?.organization.id).toBe('org1');
    expect(bad).toEqual([]);
  });

  it('con verificación en dos pasos: antes y después del código', async () => {
    const c = makeContainer({ staff: new SlowStaff({ memberships: [adminMembership] }) });
    c.fakes.security.factors = [{ id: 'f1', name: 'App', verified: true, createdAt: new Date() }]; c.fakes.security.state = { current: 'aal1', next: 'aal2' };
    c.session.start(); await flush();
    const bad = risky(c);
    await c.fakes.staff.signIn('ana@x.co'); await new Promise((r) => setTimeout(r, 20));
    expect(c.session.getSnapshot().mfa).toBe('required');
    await c.fakes.security.mfaVerify('f1', '123456'); await c.session.completeMfa();
    expect(c.session.membership?.organization.id).toBe('org1');
    expect(bad).toEqual([]);
  });

  it('si otra cuenta inicia sesión (otra pestaña) se suelta todo lo de la anterior: conexión, token y datos en memoria', async () => {
    const c = await ready('admin');
    await c.session.connect('notaria12', 'pw');
    expect(c.context.token).toBe('tok1');
    let changes = 0;
    c.session.onUserChange(() => { changes++; });
    // la otra pestaña inicia sesión con otra persona
    c.fakes.staff.membershipList = [agentMembership];
    c.fakes.staff.user = { id: 'u9', email: 'otra@x.co', displayName: 'Otra Persona' };
    c.fakes.staff.listeners.forEach((l) => l(c.fakes.staff.user));
    expect(changes).toBe(1);
    expect(c.session.getSnapshot().connection.status).toBe('disconnected');
    expect(c.context.token).toBeNull();
    await flush(); await flush();
    expect(c.session.user?.id).toBe('u9');
    expect(c.session.membership?.role).toBe('agente');
  });

  it('al salir (también desde otra pestaña) avisa el cambio de persona una sola vez', async () => {
    const c = await ready();
    let changes = 0;
    c.session.onUserChange(() => { changes++; });
    c.fakes.staff.user = null;
    c.fakes.staff.listeners.forEach((l) => l(null));
    c.fakes.staff.listeners.forEach((l) => l(null));
    expect(changes).toBe(1);
  });
});
