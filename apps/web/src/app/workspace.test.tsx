import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { screen, waitFor, within } from '@testing-library/react';
import { validationFailure } from '@qhub/core';
import { AppRoutes } from '@/app/AppRoutes';
import { applyPreferences, DEFAULT_PREFERENCES, getPreferences } from '@/features/preferences/preferences';
import { adminMembership, agentMembership, ana, FakeClients, FakeNotices, FakeSecurity, FakeStaffRepository, makeClient, makeNotice, MemoryTokenStore, supervisorMembership, receptionMembership, FakeQueueRepository } from '@/testing/fakes';
import { makeContainer, renderWith } from '@/testing/harness';
import { useRefreshInterval } from '@/features/preferences/hooks';

const savedToken = () => { const s = new MemoryTokenStore(); s.save('org1', { accessToken: 'guardado', expiresIn: 3600, issuedAt: new Date() }); return s; };
const as = (membership = adminMembership, extra: Parameters<typeof makeContainer>[0] = {}) => {
  const staff = new FakeStaffRepository({ user: ana, memberships: [membership] });
  return { staff, container: makeContainer({ staff, tokenStore: savedToken(), ...extra }) };
};
afterEach(() => { localStorage.clear(); applyPreferences(DEFAULT_PREFERENCES); vi.restoreAllMocks(); });

describe('avisos', () => {
  const notices = () => new FakeNotices([
    makeNotice('n1', { title: 'Cliente nuevo', message: 'Carla sacó su primer turno.', route: '/clientes' }),
    makeNotice('n2', { kind: 'equipo', title: 'Nueva persona en el equipo', route: '/equipo' }),
    makeNotice('n3', { title: 'Aviso viejo', read: true, createdAt: new Date(Date.now() - 3 * 864e5) }),
  ]);

  it('la campana cuenta los no leídos, lista los avisos y al abrir uno lo marca y navega', async () => {
    const n = notices();
    const { container } = as(adminMembership, { notices: n });
    const { user } = await renderWith(<AppRoutes />, container);
    const bell = await screen.findByRole('button', { name: 'Avisos: 2 sin leer' }, { timeout: 4000 });
    await user.click(bell);
    const panel = await screen.findByRole('dialog', { name: 'Avisos' });
    expect(within(panel).getByText('Carla sacó su primer turno.')).toBeInTheDocument();
    await user.click(within(panel).getByText('Cliente nuevo'));
    expect(n.calls).toContain('read:n1');
    expect(await screen.findByRole('heading', { level: 1, name: 'Clientes' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Avisos: 1 sin leer' })).toBeInTheDocument(), { timeout: 4000 });
  });

  it('la página filtra por sin leer, marca todo como leído y borra leídos', async () => {
    const n = notices();
    const { container } = as(adminMembership, { notices: n });
    const { user } = await renderWith(<AppRoutes />, container, '/notificaciones');
    expect(await screen.findByText('Aviso viejo')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /Sin leer \(2\)/ }));
    expect(screen.queryByText('Aviso viejo')).toBeNull();
    await user.click(screen.getByRole('button', { name: /Marcar todo como leído/ }));
    await waitFor(() => expect(n.calls).toContain('readAll'));
    await user.click(screen.getByRole('tab', { name: /Todos/ }));
    await user.click(screen.getByRole('button', { name: /Borrar leídos/ }));
    await waitFor(() => expect(n.items).toHaveLength(0));
    expect(await screen.findByText('Aún no hay avisos')).toBeInTheDocument();
  });

  it('un agente también tiene campana y avisos, y un aviso que lleva a una pantalla de administración no lo saca de Avisos', async () => {
    const n = new FakeNotices([makeNotice('n1', { title: 'Nueva persona en el equipo', route: '/equipo' })]);
    const { container } = as(agentMembership, { notices: n });
    const { user } = await renderWith(<AppRoutes />, container, '/notificaciones');
    expect(await screen.findByRole('heading', { level: 1, name: 'Avisos' })).toBeInTheDocument();
    await user.click((await within(screen.getByRole('main')).findAllByRole('button', { name: /Nueva persona en el equipo/ }))[0]!);
    expect(screen.getByRole('heading', { level: 1, name: 'Avisos' })).toBeInTheDocument();
  });
});

describe('búsqueda de la cabecera', () => {
  it('encuentra colas, navega con Enter y se abre con Ctrl K', async () => {
    const { container } = as();
    const { user } = await renderWith(<AppRoutes />, container, '/colas');
    await screen.findByText('Caja 1');
    await user.keyboard('{Control>}k{/Control}');
    const box = screen.getByRole('combobox', { name: /Buscar páginas, colas y personas/ });
    expect(box).toHaveFocus();
    await user.type(box, 'caja');
    expect(await screen.findByRole('option', { name: 'Caja 1' })).toBeInTheDocument();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('heading', { level: 1, name: 'En vivo' })).toBeInTheDocument();
  });

  it('solo ofrece páginas que el rol puede ver', async () => {
    const { container } = as(agentMembership);
    const { user } = await renderWith(<AppRoutes />, container, '/colas');
    await screen.findByText('Caja 1');
    const box = screen.getByRole('combobox', { name: /Buscar páginas/ });
    await user.type(box, 'cl');
    expect(screen.queryByRole('option', { name: 'Clientes' })).toBeNull();
    await user.clear(box); await user.type(box, 'ajust');
    expect(screen.getByText(/Sin resultados/)).toBeInTheDocument();
  });
});

describe('cabecera', () => {
  it('el logo lleva al inicio', async () => {
    const { container } = as();
    const { user } = await renderWith(<AppRoutes />, container, '/colas');
    await screen.findByText('Caja 1');
    await user.click(screen.getByRole('link', { name: 'Ir al inicio' }));
    expect(await screen.findByRole('heading', { level: 1, name: /Ana/ })).toBeInTheDocument();
  });
});

describe('panel de búsqueda', () => {
  it('vacío ofrece lo visitado hace poco; después recuerda las búsquedas y las páginas visitadas, y se puede borrar el historial', async () => {
    localStorage.clear();
    const { container } = as();
    const { user } = await renderWith(<AppRoutes />, container, '/colas');
    await screen.findByText('Caja 1');
    const box = screen.getByRole('combobox', { name: /Buscar páginas, colas y personas/ });
    await user.click(box);
    expect(await screen.findByRole('heading', { level: 2, name: 'Visitaste hace poco' })).toBeInTheDocument();    // ya visitó /colas
    expect(screen.queryByRole('heading', { level: 2, name: 'Historial de búsqueda' })).toBeNull();
    expect(screen.getByText(/Enter abrir/)).toBeInTheDocument();

    await user.type(box, 'caja'); await user.keyboard('{Enter}');                                             // busca y abre la cola
    expect(await screen.findByRole('heading', { level: 1, name: 'En vivo' })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('qhub.search.history')!)).toEqual(['caja']);

    await user.click(screen.getByRole('combobox', { name: /Buscar páginas/ }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Historial de búsqueda' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Visitaste hace poco' })).toBeInTheDocument();
    const list = screen.getByRole('listbox', { name: 'Resultados' });
    await user.click(within(list).getByRole('option', { name: 'caja' }));                                      // repite una búsqueda anterior
    expect(screen.getByRole('combobox', { name: /Buscar páginas/ })).toHaveValue('caja');
    await user.click(screen.getByRole('button', { name: 'Borrar búsqueda' }));
    expect(screen.getByRole('combobox', { name: /Buscar páginas/ })).toHaveValue('');

    await user.click(screen.getByRole('button', { name: 'Borrar todo' }));
    expect(screen.queryByRole('heading', { level: 2, name: 'Historial de búsqueda' })).toBeNull();
    expect(JSON.parse(localStorage.getItem('qhub.search.history')!)).toEqual([]);
  });

  it('los accesos del panel respetan el rol', async () => {
    localStorage.clear();
    const { container } = as(receptionMembership);
    const { user } = await renderWith(<AppRoutes />, container, '/en-vivo');
    await screen.findByRole('heading', { level: 1, name: 'En vivo' });
    await user.click(screen.getByRole('combobox', { name: /Buscar páginas/ }));
    const list = await screen.findByRole('listbox', { name: 'Resultados' });
    expect(within(list).getByRole('option', { name: 'En vivo' })).toBeInTheDocument();
    for (const t of ['Dashboard', 'Historial', 'Clientes', 'Equipo']) expect(within(list).queryByRole('option', { name: t }), t).toBeNull();
  });
});

describe('menú lateral contraíble', () => {
  it('se contrae a íconos con nombre accesible y recuerda la elección', async () => {
    const { container } = as();
    const { user } = await renderWith(<AppRoutes />, container);
    await screen.findByRole('heading', { level: 1, name: /Ana/ });
    const nav = screen.getByRole('navigation', { name: 'Principal' });
    expect(within(nav).getByText('Historial')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Contraer menú' }));
    expect(within(nav).queryByText('Historial')).toBeNull();
    expect(within(nav).getByRole('link', { name: 'Historial' })).toHaveAttribute('title', 'Historial');
    expect(localStorage.getItem('qhub.sidebar')).toBe('1');
    await user.click(screen.getByRole('button', { name: 'Expandir menú' }));
    expect(within(nav).getByText('Historial')).toBeInTheDocument();
    expect(localStorage.getItem('qhub.sidebar')).toBe('0');
  });
});

describe('actualización automática', () => {
  it('el intervalo sale de la preferencia (manual = sin sondeo)', () => {
    applyPreferences({ ...DEFAULT_PREFERENCES, refreshSeconds: 10 });
    expect(renderHook(() => useRefreshInterval()).result.current).toBe(10_000);
    applyPreferences({ ...DEFAULT_PREFERENCES, refreshSeconds: 0 });
    expect(renderHook(() => useRefreshInterval()).result.current).toBe(false);
  });

  it('se elige desde la pantalla, se guarda y se puede actualizar a mano', async () => {
    const { container } = as();
    const { user } = await renderWith(<AppRoutes />, container, '/colas');
    await screen.findByText('Caja 1');
    expect(getPreferences().refreshSeconds).toBe(30);
    await user.selectOptions(screen.getByLabelText('Actualización automática'), '10');
    expect(getPreferences().refreshSeconds).toBe(10);
    expect(JSON.parse(localStorage.getItem('qhub.prefs')!).refreshSeconds).toBe(10);
    await user.click(screen.getByRole('button', { name: 'Actualizar' }));
    expect(screen.getByText(/Actualizado|Actualizando/)).toBeInTheDocument();
  });
});

describe('clientes', () => {
  const list = () => new FakeClients([makeClient('c1'), makeClient('c2', { firstName: 'Pedro', lastName: 'Ruiz', email: null, blocked: true, noShow: 0, follows: false })], [{ id: 't1', queueName: 'Caja 1', number: 21, status: 'finalizado', createdAt: new Date() }]);

  it('el administrador ve contacto, abre el detalle y bloquea con motivo', async () => {
    const clients = list();
    const { container } = as(adminMembership, { clients });
    const { user } = await renderWith(<AppRoutes />, container, '/clientes');
    expect(await screen.findByText('Carla Mena')).toBeInTheDocument();
    expect(screen.getByText('carla@x.co')).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Ver' })[0]!);
    const dialog = await screen.findByRole('dialog', { name: 'Carla Mena' });
    expect(await within(dialog).findByText('Caja 1')).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/^Motivo \(opcional\)/), 'Abuso');
    await user.click(within(dialog).getByRole('button', { name: /Bloquear cliente/ }));
    await waitFor(() => expect(clients.calls).toContain('block:c1:Abuso'));
    expect(await within(dialog).findByRole('button', { name: 'Desbloquear' })).toBeInTheDocument();
  });

  it('filtra por bloqueados y busca sin tildes', async () => {
    const { container } = as(adminMembership, { clients: list() });
    const { user } = await renderWith(<AppRoutes />, container, '/clientes');
    await screen.findByText('Carla Mena');
    await user.selectOptions(screen.getByLabelText('Mostrar'), 'bloqueados');
    expect(screen.queryByText('Carla Mena')).toBeNull();
    expect(screen.getByText('Pedro Ruiz')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Mostrar'), 'todos');
    await user.type(screen.getByLabelText(/Buscar por nombre/), 'CARLA');
    expect(screen.queryByText('Pedro Ruiz')).toBeNull();
  });

  it('el supervisor ve la actividad pero no puede bloquear', async () => {
    const clients = new FakeClients([makeClient('c1', { email: null, phone: null })]);
    const { container } = as(supervisorMembership, { clients });
    const { user } = await renderWith(<AppRoutes />, container, '/clientes');
    expect(await screen.findByText(/Tu rol ve el nombre y la actividad/)).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Ver' }));
    const dialog = await screen.findByRole('dialog', { name: 'Carla Mena' });
    expect(within(dialog).queryByRole('button', { name: /Bloquear/ })).toBeNull();
  });

  it('un agente no entra a /clientes', async () => {
    const { container } = as(agentMembership);
    await renderWith(<AppRoutes />, container, '/clientes');
    expect(await screen.findByRole('heading', { level: 1, name: /Ana/ })).toBeInTheDocument();
  });

  it('estado vacío con orientación', async () => {
    const { container } = as(adminMembership, { clients: new FakeClients([]) });
    await renderWith(<AppRoutes />, container, '/clientes');
    expect(await screen.findByText('Aún no hay clientes')).toBeInTheDocument();
  });
});

describe('verificación en dos pasos', () => {
  const factor = { id: 'f1', name: 'App', verified: true, createdAt: new Date() };

  it('al iniciar sesión con 2FA pide el código antes de mostrar nada, y avisa si es incorrecto', async () => {
    const security = new FakeSecurity(); security.factors = [factor]; security.state = { current: 'aal1', next: 'aal2' };
    const { container } = as(adminMembership, { security });
    const { user } = await renderWith(<AppRoutes />, container);
    expect(await screen.findByRole('heading', { name: 'Verificación en dos pasos' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Principal' })).toBeNull();
    await user.type(screen.getByLabelText('Código de 6 dígitos'), '12345');
    await user.click(screen.getByRole('button', { name: /Verificar/ }));
    expect(screen.getByText('Escribe los 6 dígitos de tu app.')).toBeInTheDocument();
    security.verifyFailure = validationFailure('El código no es correcto o ya venció. Prueba con el siguiente.');
    await user.type(screen.getByLabelText('Código de 6 dígitos'), '6');
    await user.click(screen.getByRole('button', { name: /Verificar/ }));
    expect(await screen.findByText(/no es correcto o ya venció/)).toBeInTheDocument();
    security.verifyFailure = null;
    await user.click(screen.getByRole('button', { name: /Verificar/ }));
    expect(await screen.findByRole('heading', { level: 1, name: /Ana/ })).toBeInTheDocument();
    expect(security.calls).toContain('verify:f1:123456');
  });

  it('sin 2FA entra directo', async () => {
    const { container } = as();
    await renderWith(<AppRoutes />, container);
    expect(await screen.findByRole('heading', { level: 1, name: /Ana/ })).toBeInTheDocument();
  });

  it('activarla desde el perfil: QR, código y confirmación; luego desactivarla', async () => {
    const security = new FakeSecurity();
    const { container } = as(adminMembership, { security });
    const { user } = await renderWith(<AppRoutes />, container, '/perfil?tab=seguridad');
    expect(await screen.findByText('No activada')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Activar verificación/ }));
    expect(await screen.findByAltText('Código QR para tu app autenticadora')).toBeInTheDocument();
    expect(screen.getByText('ABCD EFGH')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Activar$/ }));
    expect(screen.getByText('Escribe los 6 dígitos de tu app.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Código de 6 dígitos'), '654321');
    await user.click(screen.getByRole('button', { name: /^Activar$/ }));
    expect(await screen.findByText('Activada')).toBeInTheDocument();
    expect(security.calls).toContain('confirm:f-new:654321');
    await user.click(screen.getByRole('button', { name: 'Desactivar' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Desactivar' }));
    await waitFor(() => expect(security.calls).toContain('remove:f-new'));
    expect(await screen.findByText('No activada')).toBeInTheDocument();
  });

  it('cambiar correo valida y envía la confirmación; cerrar en todos los dispositivos pide confirmar', async () => {
    const security = new FakeSecurity();
    const { container } = as(adminMembership, { security });
    const { user } = await renderWith(<AppRoutes />, container, '/perfil?tab=seguridad');
    await user.type(await screen.findByLabelText('Correo nuevo'), 'ana@x.co');
    await user.click(screen.getByRole('button', { name: 'Cambiar correo' }));
    expect(screen.getByText('Ese ya es tu correo.')).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Correo nuevo')); await user.type(screen.getByLabelText('Correo nuevo'), 'nueva@x.co');
    await user.click(screen.getByRole('button', { name: 'Cambiar correo' }));
    await waitFor(() => expect(security.calls).toContain('email:nueva@x.co'));
    await user.click(screen.getByRole('button', { name: /Cerrar sesión en todos los dispositivos/ }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cerrar todas' }));
    await waitFor(() => expect(security.calls).toContain('signOutEverywhere'));
  });

  it('el nivel de seguridad refleja lo que falta', async () => {
    const { container } = as();
    await renderWith(<AppRoutes />, container, '/perfil?tab=seguridad');
    expect(await screen.findByText(/Nivel de seguridad · 1 de 3/)).toBeInTheDocument();   // correo confirmado; falta 2FA y teléfono
  });
});

describe('inicio: accesos a la mano', () => {
  it('muestra accesos rápidos según el rol, con lo que hay pendiente, y no trae gráficas ni exportación', async () => {
    const { container } = as(adminMembership, { notices: new FakeNotices([makeNotice('n1'), makeNotice('n2')]) });
    await renderWith(<AppRoutes />, container);
    const quick = await screen.findByRole('region', { name: 'Accesos rápidos' });
    for (const t of ['Dashboard', 'Colas', 'En vivo', 'Historial', 'Clientes', 'Equipo', 'Ajustes', 'Avisos', 'Mi perfil']) expect(within(quick).getByRole('link', { name: new RegExp(`^${t}`) })).toBeInTheDocument();
    expect(await within(quick).findByText('2 sin leer')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Descargar CSV' })).toBeNull();
    expect(screen.queryByText('Tasa de no-show')).toBeNull();
  });

  it('recepción solo ve los accesos que le tocan', async () => {
    const { container } = as(receptionMembership);
    await renderWith(<AppRoutes />, container);
    const quick = await screen.findByRole('region', { name: 'Accesos rápidos' });
    expect(within(quick).getByRole('link', { name: /^En vivo/ })).toBeInTheDocument();
    expect(within(quick).getByRole('link', { name: /^Avisos/ })).toBeInTheDocument();      // los avisos son de todos los roles
    for (const t of ['Dashboard', 'Historial', 'Clientes', 'Equipo', 'Ajustes']) expect(within(quick).queryByRole('link', { name: new RegExp(`^${t}`) }), t).toBeNull();
  });

  it('recuerda las páginas visitadas', async () => {
    const { container } = as();
    const { user } = await renderWith(<AppRoutes />, container, '/colas');
    await screen.findByText('Caja 1');
    await user.click(within(screen.getByRole('navigation', { name: 'Principal' })).getByRole('link', { name: /Inicio/ }));
    const recents = await screen.findByRole('region', { name: 'Visitaste hace poco' });
    expect(within(recents).getByRole('link', { name: 'Colas' })).toBeInTheDocument();
  });

  it('la lista de arranque tiene progreso y pasos personales y de organización', async () => {
    const { container } = as();
    await renderWith(<AppRoutes />, container);
    expect(await screen.findByRole('progressbar', { name: 'Progreso de configuración' })).toBeInTheDocument();
    expect(screen.getByText('Activar la verificación en dos pasos')).toBeInTheDocument();
    expect(screen.getByText('Completar los datos de la organización')).toBeInTheDocument();
  });

  it('el agente solo ve los pasos personales', async () => {
    const { container } = as(agentMembership);
    await renderWith(<AppRoutes />, container);
    expect(await screen.findByText('Completar tu perfil')).toBeInTheDocument();
    expect(screen.queryByText('Crear tu primera cola')).toBeNull();
  });
});

describe('dashboard', () => {
  const stubDownloads = () => { const create = vi.fn(() => 'blob:x'); Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() }); return create; };

  it('muestra indicadores con comparación, gráficas y periodos', async () => {
    const { container } = as();
    const { user } = await renderWith(<AppRoutes />, container, '/dashboard');
    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
    for (const k of ['Turnos', 'Atendidos', 'Espera promedio', 'Atención promedio', 'Tasa de no-show']) expect((await screen.findAllByText(k)).length).toBeGreaterThan(0);
    for (const g of ['Turnos por día', 'Espera promedio', 'Estado de los turnos', 'Resumen por cola', 'Clientes nuevos']) expect(screen.getAllByRole('heading', { level: 2, name: g }).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('tab', { name: 'Hoy' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Turnos por hora' })).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: '30 días' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Turnos por día' })).toBeInTheDocument();
  });

  it('cada gráfica se puede ver como tabla y descargar en CSV', async () => {
    const create = stubDownloads();
    const { container } = as();
    const { user } = await renderWith(<AppRoutes />, container, '/dashboard');
    const panel = (await screen.findByRole('heading', { level: 2, name: 'Estado de los turnos' })).closest('section')!;
    expect(within(panel).getByRole('button', { name: 'Gráfico' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(within(panel).getByRole('button', { name: 'Tabla' }));
    const table = within(panel).getByRole('table', { name: 'Datos de Estado de los turnos' });
    expect(within(table).getByText('Finalizado')).toBeInTheDocument(); expect(within(table).getAllByRole('row').length).toBe(5);       // cabecera + 4 estados
    await user.click(within(panel).getByRole('button', { name: 'Descargar CSV: Estado de los turnos' }));
    expect(create).toHaveBeenCalledTimes(1);
    await user.click(within(panel).getByRole('button', { name: 'Gráfico' }));
    expect(within(panel).getByRole('button', { name: 'Gráfico' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(panel).getByRole('button', { name: 'Tabla' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('descarga el reporte completo en CSV y el PDF (impresión) con el título del reporte', async () => {
    const create = stubDownloads();
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    const { container } = as();
    const { user } = await renderWith(<AppRoutes />, container, '/dashboard');
    const csv = await screen.findByRole('button', { name: 'Descargar CSV' });
    await waitFor(() => expect(csv).toBeEnabled());
    await user.click(csv);
    expect(create).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Descargar PDF' }));
    expect(print).toHaveBeenCalled();
    expect(document.title).toMatch(/^Reporte Notaría 12/);
    window.dispatchEvent(new Event('afterprint'));
    expect(document.title).not.toMatch(/^Reporte/);
  });

  it('el agente ve el dashboard y exporta; recepción vuelve al inicio', async () => {
    const a = as(agentMembership);
    await renderWith(<AppRoutes />, a.container, '/dashboard');
    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: 'Clientes nuevos' })).toBeNull();       // sin permiso de clientes
    expect(screen.getByRole('button', { name: 'Descargar CSV' })).toBeInTheDocument();
  });
  it('recepción no entra', async () => {
    const r = as(receptionMembership);
    await renderWith(<AppRoutes />, r.container, '/dashboard');
    expect(await screen.findByRole('heading', { level: 1, name: /Ana/ })).toBeInTheDocument();
  });
});

describe('errores sin detalles técnicos', () => {
  it('un fallo inesperado al cargar una pantalla muestra solo un mensaje genérico', async () => {
    const queues = new FakeQueueRepository();
    queues.list = async () => { throw new TypeError('Cannot read properties of undefined (reading "relation \\"colas\\" at db-1.internal:5432")'); };
    const { container } = as(adminMembership, { queues });
    await renderWith(<AppRoutes />, container, '/colas');
    expect(await screen.findByText('No pudimos cargar esto')).toBeInTheDocument();
    const body = document.body.textContent ?? '';
    expect(body).toMatch(/Ocurrió un error inesperado/);
    expect(body).not.toMatch(/Cannot read|undefined|relation|db-1|5432|TypeError/);
  });

  it('un Failure con texto técnico (como el de una base de datos) se muestra como mensaje genérico de su tipo', async () => {
    const { badRequestFailure } = await import('@qhub/core');
    const queues = new FakeQueueRepository();
    queues.list = async () => ({ ok: false, failure: badRequestFailure('new row for relation "colas" violates check constraint "colas_nombre_check"') });
    const { container } = as(adminMembership, { queues });
    await renderWith(<AppRoutes />, container, '/colas');
    await screen.findByText('No pudimos cargar esto');
    expect(document.body.textContent).not.toMatch(/relation|constraint|colas_nombre/);
    expect(document.body.textContent).toMatch(/La solicitud no es válida/);
  });

  it('los ajustes no muestran nombres de servicios internos', async () => {
    const { container } = as();
    await renderWith(<AppRoutes />, container, '/ajustes');
    await screen.findByText(/El servicio (funciona con normalidad|tiene un problema temporal)/);
    expect(document.body.textContent).not.toMatch(/RabbitMQ|Supabase|Mensajería|Base de datos/i);
  });
});

describe('avisos emergentes', () => {
  it('un aviso nuevo aparece como notificación flotante; los que ya existían al abrir no', async () => {
    const notices = new FakeNotices([makeNotice('old', { title: 'Aviso viejo' })]);
    const { container } = as(adminMembership, { notices });
    const { user } = await renderWith(<AppRoutes />, container);
    await screen.findByRole('button', { name: /^Avisos/ });
    expect(screen.queryByText('Aviso viejo', { selector: 'strong' })).toBeNull();
    notices.items = [makeNotice('new', { title: 'Invitación enviada', message: 'Ana invitó a luis@x.co como agente.', route: '/equipo' }), ...notices.items];
    expect(await screen.findByText('Invitación enviada', { selector: 'strong' }, { timeout: 15000 })).toBeInTheDocument();
    expect(screen.getByText('Ana invitó a luis@x.co como agente.', { exact: false })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ver' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Equipo' })).toBeInTheDocument();
  }, 30000);
});
