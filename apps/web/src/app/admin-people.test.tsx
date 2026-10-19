import { describe, expect, it } from 'vitest';
import { validatePassword } from '@qhub/core';
import { screen, waitFor, within } from '@testing-library/react';
import { AppRoutes } from '@/app/AppRoutes';
import { adminMembership, agentMembership, personalMembership, ana, FakeClients, FakeStaffRepository, makeClient, MemoryTokenStore, supervisorMembership } from '@/testing/fakes';
import { makeContainer, renderWith } from '@/testing/harness';

const savedToken = () => { const s = new MemoryTokenStore(); s.save('org1', { accessToken: 'guardado', expiresIn: 3600, issuedAt: new Date() }); return s; };

describe('equipo: el administrador edita y quita a su gente', () => {
  const open = async (membership = adminMembership) => {
    const staff = new FakeStaffRepository({ user: ana, memberships: [membership] });
    const r = await renderWith(<AppRoutes />, makeContainer({ staff, tokenStore: savedToken() }), '/equipo');
    await screen.findByText('Luis Vera');
    return { ...r, staff };
  };

  it('edita el perfil de alguien del equipo con validaciones', async () => {
    const { user, staff } = await open();
    await user.click(screen.getAllByRole('button', { name: 'Editar' })[0]!);
    const dialog = await screen.findByRole('dialog', { name: 'Editar a Luis Vera' });
    expect(await within(dialog).findByDisplayValue('Caja')).toBeInTheDocument();       // precargado
    await user.clear(within(dialog).getByLabelText('Apellido')); await user.type(within(dialog).getByLabelText('Apellido'), 'V3');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    expect(within(dialog).getByText('Usa solo letras, sin números ni símbolos.')).toBeInTheDocument();
    await user.clear(within(dialog).getByLabelText('Apellido')); await user.type(within(dialog).getByLabelText('Apellido'), 'Vera Soto');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(staff.calls).toContain('editMember:u2:Luis:Vera Soto:Caja'));
    expect(await screen.findByText('Perfil actualizado.')).toBeInTheDocument();
  });

  it('quita a alguien del equipo con confirmación, y no se puede editar ni quitar a uno mismo', async () => {
    const { user, staff } = await open();
    expect(screen.queryByRole('button', { name: /Quitar a Ana Gómez/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Quitar a Luis Vera del equipo' }));
    expect(screen.getByText(/Su cuenta no se borra/)).toBeInTheDocument();
    expect(staff.calls).not.toContain('removeMember:u2');
    await user.click(screen.getByRole('button', { name: 'Quitar del equipo' }));
    await waitFor(() => expect(staff.calls).toContain('removeMember:u2'));
  });

  it('el supervisor ve el equipo pero no puede editar ni quitar', async () => {
    await open(supervisorMembership);
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Quitar a/ })).toBeNull();
  });
});

describe('clientes: solo eliminar; editar exige el permiso del cliente', () => {
  const open = async (clients = new FakeClients([makeClient('c1')])) => {
    const staff = new FakeStaffRepository({ user: ana, memberships: [adminMembership] });
    const r = await renderWith(<AppRoutes />, makeContainer({ staff, clients, tokenStore: savedToken() }), '/clientes');
    await screen.findByText('Carla Mena');
    await r.user.click(screen.getAllByRole('button', { name: 'Ver' })[0]!);
    return { ...r, clients, dialog: await screen.findByRole('dialog', { name: 'Carla Mena' }) };
  };

  it('sin permiso no hay formulario de edición: solo se puede pedir', async () => {
    const { user, clients, dialog } = await open();
    expect(await within(dialog).findByRole('button', { name: 'Pedir permiso para editar' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Guardar cambios' })).toBeNull();
    await user.type(within(dialog).getByLabelText(/Motivo de la solicitud/), 'Corregir apellido');
    await user.click(within(dialog).getByRole('button', { name: 'Pedir permiso para editar' }));
    await waitFor(() => expect(clients.calls).toContain('requestEdit:c1:Corregir apellido'));
    expect(await within(dialog).findByText('Esperando el permiso del cliente.')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Guardar cambios' })).toBeNull();
  });

  it('con el permiso aprobado puede hacer un cambio, y después vuelve a pedir permiso', async () => {
    const clients = new FakeClients([makeClient('c1')]);
    clients.permission = { status: 'aprobada', requestedAt: new Date(), expiresAt: new Date(Date.now() + 864e5) };
    const { user, dialog } = await open(clients);
    expect(await within(dialog).findByText('El cliente dio su permiso.')).toBeInTheDocument();
    await user.clear(within(dialog).getByLabelText('Apellido')); await user.type(within(dialog).getByLabelText('Apellido'), 'Mena Paz');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(clients.calls.some((c) => c.startsWith('edit:c1:Carla:Mena Paz'))).toBe(true));
    expect(await within(dialog).findByRole('button', { name: 'Pedir permiso para editar' })).toBeInTheDocument();
  });

  it('un permiso rechazado se dice y se puede volver a pedir', async () => {
    const clients = new FakeClients([makeClient('c1')]); clients.permission = { status: 'rechazada', requestedAt: new Date(), expiresAt: null };
    const { dialog } = await open(clients);
    expect(await within(dialog).findByText('El cliente no dio su permiso.')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Pedir permiso para editar' })).toBeInTheDocument();
  });

  it('eliminar pide confirmación y lo saca de la lista', async () => {
    const { user, clients, dialog } = await open();
    await user.click(await within(dialog).findByRole('button', { name: 'Eliminar cliente' }));
    const confirm = await screen.findByRole('dialog', { name: 'Eliminar cliente' });
    expect(within(confirm).getByText(/No se puede deshacer/)).toBeInTheDocument();
    expect(clients.calls).not.toContain('remove:c1');
    await user.click(within(confirm).getByRole('button', { name: 'Eliminar cliente' }));
    await waitFor(() => expect(clients.calls).toContain('remove:c1'));
    expect(await screen.findByText('Eliminamos al cliente de tu lista.')).toBeInTheDocument();
  });

  it('el supervisor no ve ni eliminar ni pedir permisos', async () => {
    const staff = new FakeStaffRepository({ user: ana, memberships: [supervisorMembership] });
    const { user } = await renderWith(<AppRoutes />, makeContainer({ staff, clients: new FakeClients([makeClient('c1')]), tokenStore: savedToken() }), '/clientes');
    await screen.findByText('Carla Mena');
    await user.click(screen.getAllByRole('button', { name: 'Ver' })[0]!);
    const dialog = await screen.findByRole('dialog', { name: 'Carla Mena' });
    expect(within(dialog).queryByRole('button', { name: 'Eliminar cliente' })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: /Pedir permiso/ })).toBeNull();
  });
});

describe('invitar con contraseña inicial y permisos de cambio', () => {
  it('el administrador puede asignar la contraseña al invitar; se muestra una sola vez y se valida', async () => {
    const staff = new FakeStaffRepository({ user: ana, memberships: [adminMembership] });
    const { user } = await renderWith(<AppRoutes />, makeContainer({ staff, tokenStore: savedToken() }), '/equipo');
    await screen.findByText('Luis Vera');
    await user.type(screen.getByLabelText('Correo'), 'nuevo@x.co');
    await user.type(screen.getByLabelText('Contraseña inicial (opcional)'), '12345678');
    await user.click(screen.getByRole('button', { name: 'Enviar invitación' }));
    expect(screen.getByLabelText('Contraseña inicial (opcional)')).toHaveAttribute('aria-invalid', 'true');      // '12345678' es una contraseña débil
    expect(staff.calls.filter((c) => c.startsWith('invite:'))).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Generar' }));
    await user.click(screen.getByRole('button', { name: 'Enviar invitación' }));
    const dialog = await screen.findByRole('dialog', { name: 'Invitación enviada' });
    expect(staff.calls).toContain('invite:nuevo@x.co:agente:conclave');
    expect(within(dialog).getByText('nuevo@x.co')).toBeInTheDocument();
    expect(within(dialog).getByText(/Es la única vez que se muestra/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Listo' }));
    expect(screen.queryByRole('dialog', { name: 'Invitación enviada' })).toBeNull();
  });

  it('el administrador aprueba o rechaza las solicitudes del equipo', async () => {
    const staff = new FakeStaffRepository({ user: ana, memberships: [adminMembership] });
    staff.requests = [{ id: 'r1', userId: 'u2', name: 'Luis Vera', type: 'contrasena', reason: 'Quiero una propia', createdAt: new Date() }, { id: 'r2', userId: 'u3', name: 'Camila Lopez', type: 'datos', reason: null, createdAt: new Date() }];
    const { user } = await renderWith(<AppRoutes />, makeContainer({ staff, tokenStore: savedToken() }), '/equipo');
    expect(await screen.findByText('Cambiar su contraseña')).toBeInTheDocument();
    expect(screen.getByText('“Quiero una propia”')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Aprobar' }));
    await waitFor(() => expect(staff.calls).toContain('respond:r1:true'));
    await user.click(await screen.findByRole('button', { name: 'Rechazar' }));
    await waitFor(() => expect(staff.calls).toContain('respond:r2:false'));
    // lo resuelto queda en el historial, con su resultado
    expect(await screen.findByText('Historial de solicitudes')).toBeInTheDocument();
    expect(screen.getByText('Aprobada')).toBeInTheDocument();
    expect(screen.getByText('Rechazada')).toBeInTheDocument();
  });

  it('todo integrante del equipo necesita permiso para cambiar su contraseña: se pide y, aprobado, se puede cambiar una vez', async () => {
    const staff = new FakeStaffRepository({ user: { ...ana, passwordAssigned: true }, memberships: [agentMembership] });
    const { user } = await renderWith(<AppRoutes />, makeContainer({ staff, tokenStore: savedToken() }), '/perfil?tab=seguridad');
    expect(await screen.findByText(/Tu contraseña la gestiona tu administrador/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cambiar contraseña' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Enviar solicitud para cambiar mi contraseña' }));
    await waitFor(() => expect(staff.calls).toContain('requestChange:contrasena:'));
    expect(await screen.findByText('Esperando la respuesta de tu administrador.')).toBeInTheDocument();
  });

  it('con el permiso aprobado aparece el formulario y al cambiar se gasta el permiso', async () => {
    const staff = new FakeStaffRepository({ user: { ...ana, passwordAssigned: true }, memberships: [agentMembership] });
    staff.permission = { status: 'aprobada', expiresAt: new Date(Date.now() + 864e5) };
    const { user } = await renderWith(<AppRoutes />, makeContainer({ staff, tokenStore: savedToken() }), '/perfil?tab=seguridad');
    expect(await screen.findByText('Tu administrador aprobó el cambio.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Contraseña actual'), 'Vieja-clave-12');
    await user.type(screen.getByLabelText('Contraseña nueva'), 'Taza-azul-77');
    await user.type(screen.getByLabelText('Repite la contraseña nueva'), 'Taza-azul-77');
    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
    await waitFor(() => expect(staff.calls).toContain('spendPermission'));
  });

  it('quien no tiene administrador (cuenta personal) o lo es, cambia su contraseña sin pedir permiso', async () => {
    const staff = new FakeStaffRepository({ user: ana, memberships: [personalMembership] });
    await renderWith(<AppRoutes />, makeContainer({ staff, tokenStore: savedToken() }), '/perfil?tab=seguridad');
    expect(await screen.findByRole('button', { name: 'Cambiar contraseña' })).toBeInTheDocument();
  });

  it('un integrante que no es admin puede pedirle un cambio de datos al administrador', async () => {
    const staff = new FakeStaffRepository({ user: ana, memberships: [agentMembership] });
    const { user } = await renderWith(<AppRoutes />, makeContainer({ staff, tokenStore: savedToken() }), '/perfil');
    await user.type(await screen.findByLabelText('¿Qué quieres cambiar?'), 'Mi apellido está mal escrito');
    await user.click(screen.getByRole('button', { name: 'Enviar solicitud' }));
    await waitFor(() => expect(staff.calls).toContain('requestChange:datos:Mi apellido está mal escrito'));
  });
});

describe('equipo gestionado y generador de contraseñas', () => {
  it('un integrante del equipo no edita su nombre, cargo ni teléfono; ve cómo pedir el cambio', async () => {
    const staff = new FakeStaffRepository({ user: ana, memberships: [agentMembership] });
    await renderWith(<AppRoutes />, makeContainer({ staff, tokenStore: savedToken() }), '/perfil');
    expect(await screen.findByText('Tu administrador gestiona tu nombre, apellido, cargo y teléfono.')).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre')).toBeDisabled();
    expect(screen.getByLabelText('Apellido')).toBeDisabled();
  });

  it('una cuenta personal edita lo que quiera: no hay administrador', async () => {
    const staff = new FakeStaffRepository({ user: ana, memberships: [personalMembership] });
    await renderWith(<AppRoutes />, makeContainer({ staff, tokenStore: savedToken() }), '/perfil');
    expect(await screen.findByLabelText('Nombre')).toBeEnabled();
    expect(screen.queryByText(/gestiona tu nombre/)).toBeNull();
    expect(screen.queryByText('Pedir un cambio al administrador')).toBeNull();
  });

  it('el administrador también edita sus propios datos', async () => {
    const staff = new FakeStaffRepository({ user: ana, memberships: [adminMembership] });
    await renderWith(<AppRoutes />, makeContainer({ staff, tokenStore: savedToken() }), '/perfil');
    expect(await screen.findByLabelText('Nombre')).toBeEnabled();
  });

  it('«Generar contraseña segura» llena la contraseña y su repetición con una que cumple las reglas', async () => {
    const staff = new FakeStaffRepository({ user: ana, memberships: [adminMembership] });
    const { user } = await renderWith(<AppRoutes />, makeContainer({ staff, tokenStore: savedToken() }), '/perfil?tab=seguridad');
    await user.click(await screen.findByRole('button', { name: 'Generar contraseña segura' }));
    const next = (screen.getByLabelText('Contraseña nueva') as HTMLInputElement).value;
    expect(next).toHaveLength(14);
    expect(validatePassword(next, { email: 'ana@x.co' })).toBeNull();
    expect((screen.getByLabelText('Repite la contraseña nueva') as HTMLInputElement).value).toBe(next);
  });
});

describe('ID de la organización', () => {
  it('Ajustes muestra el ID (QH-…) para que los clientes la encuentren y avisa si aún no está publicada', async () => {
    const staff = new FakeStaffRepository({ user: ana, memberships: [adminMembership] });
    await renderWith(<AppRoutes />, makeContainer({ staff, tokenStore: savedToken() }), '/ajustes');
    expect(await screen.findByLabelText('ID de la organización')).toHaveTextContent('QH-7K2M9X');
    expect(screen.getByRole('button', { name: 'Copiar ID' })).toBeEnabled();
    expect(screen.getByText('Todavía no te pueden encontrar.')).toBeInTheDocument();
  });
});
