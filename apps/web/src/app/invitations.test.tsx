import { afterEach, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { AppRoutes } from '@/app/AppRoutes';
import { clearInvitation, pendingInvitation } from '@/features/invitation/pending-invitation';
import { adminMembership, ana, FakeStaffRepository, MemoryTokenStore } from '@/testing/fakes';
import { makeContainer, renderWith } from '@/testing/harness';

const savedToken = () => { const s = new MemoryTokenStore(); s.save('org1', { accessToken: 'guardado', expiresIn: 3600, issuedAt: new Date() }); return s; };
const TOKEN = 'a1b2c3d4e5f6a7b8c9d0';
const preview = { organization: 'Notaría 12', kind: 'empresa' as const, role: 'agente' as const, email: 'ana@x.co', firstName: 'Carla', lastName: 'Mena', position: 'Caja', expiresAt: new Date(Date.now() + 864e5) };

afterEach(() => clearInvitation());

describe('equipo: invitar por correo', () => {
  async function openTeam(staff = new FakeStaffRepository({ user: ana, memberships: [adminMembership] })) {
    const r = await renderWith(<AppRoutes />, makeContainer({ staff, tokenStore: savedToken() }), '/equipo');
    await screen.findByText('Ana Gómez (tú)');
    return { ...r, staff };
  }

  it('invita con el perfil configurado y avisa que se envió el correo', async () => {
    const { user, staff } = await openTeam();
    await user.type(screen.getByLabelText('Correo'), 'carla@x.co');
    await user.type(screen.getByLabelText('Nombre (opcional)'), 'Carla');
    await user.type(screen.getByLabelText('Apellido (opcional)'), 'Mena');
    await user.type(screen.getByLabelText('Cargo (opcional)'), 'Caja');
    await user.click(screen.getByRole('button', { name: 'Enviar invitación' }));
    expect(await screen.findByText('Enviamos la invitación a carla@x.co.')).toBeInTheDocument();
    expect(staff.invitationsList[0]).toMatchObject({ email: 'carla@x.co', firstName: 'Carla', lastName: 'Mena', position: 'Caja' });
    expect(await screen.findByText('Carla Mena')).toBeInTheDocument();     // en pendientes, con el nombre y no solo el correo
  });

  it('valida el correo, que no sea el propio y los nombres', async () => {
    const { user, staff } = await openTeam();
    await user.type(screen.getByLabelText('Correo'), 'sin-arroba');
    await user.click(screen.getByRole('button', { name: 'Enviar invitación' }));
    expect(screen.getByText('Escribe un correo válido.')).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Correo')); await user.type(screen.getByLabelText('Correo'), 'ANA@x.co');
    await user.click(screen.getByRole('button', { name: 'Enviar invitación' }));
    expect(screen.getByText('Ese es tu propio correo.')).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Correo')); await user.type(screen.getByLabelText('Correo'), 'luis@x.co');
    await user.type(screen.getByLabelText('Nombre (opcional)'), 'R2D2');
    await user.click(screen.getByRole('button', { name: 'Enviar invitación' }));
    expect(screen.getByText('Usa solo letras, sin números ni símbolos.')).toBeInTheDocument();
    expect(staff.calls.filter((c) => c.startsWith('invite:'))).toEqual([]);
  });

  it('si la persona ya es del equipo lo dice, sin crear nada', async () => {
    const { user, staff } = await openTeam();
    await user.type(screen.getByLabelText('Correo'), 'miembro@x.co');
    await user.click(screen.getByRole('button', { name: 'Enviar invitación' }));
    expect(await screen.findByText('Esa persona ya es parte del equipo.')).toBeInTheDocument();
    expect(staff.invitationsList).toEqual([]);
  });

  it('si el correo no pudo salir la invitación queda y se avisa cómo seguir', async () => {
    const staff = new FakeStaffRepository({ user: ana, memberships: [adminMembership] }); staff.emailSends = false;
    const { user } = await openTeam(staff);
    await user.type(screen.getByLabelText('Correo'), 'luis@x.co');
    await user.click(screen.getByRole('button', { name: 'Enviar invitación' }));
    expect(await screen.findByText(/hay demasiados correos seguidos/)).toBeInTheDocument();
    expect(staff.invitationsList).toHaveLength(1);
  });

  it('el código se ve censurado y se muestra u oculta a pedido; se puede reenviar y cancelar', async () => {
    const staff = new FakeStaffRepository({ user: ana, memberships: [adminMembership] });
    await staff.invite('org1', { email: 'luis@x.co', role: 'agente' });
    const { user } = await openTeam(staff);
    const code = await screen.findByLabelText('Código de invitación de luis@x.co');
    expect(code).not.toHaveTextContent('tok-0');
    expect(code).toHaveTextContent('••••');
    await user.click(screen.getByRole('button', { name: 'Mostrar el código de luis@x.co' }));
    expect(code).toHaveTextContent('tok-0');
    await user.click(screen.getByRole('button', { name: 'Ocultar el código de luis@x.co' }));
    expect(code).not.toHaveTextContent('tok-0');
    await user.click(screen.getByRole('button', { name: 'Reenviar' }));
    await waitFor(() => expect(staff.calls).toContain('resend:i0'));
    await user.click(screen.getByRole('button', { name: 'Cancelar la invitación de luis@x.co' }));
    expect(await screen.findByText('No hay invitaciones pendientes.')).toBeInTheDocument();
    expect(staff.calls).toContain('cancel:i0');
  });
});

describe('invitación: llegar desde el botón del correo', () => {
  it('con sesión: muestra el equipo y el perfil configurado, y al aceptar entra', async () => {
    const staff = new FakeStaffRepository({ user: ana, memberships: [] }); staff.previews[TOKEN] = preview;
    const { user } = await renderWith(<AppRoutes />, makeContainer({ staff, tokenStore: savedToken() }), `/invitacion?token=${TOKEN}`);
    expect(await screen.findByRole('heading', { name: 'Te invitaron a Notaría 12' })).toBeInTheDocument();
    expect(screen.getByText('Carla Mena')).toBeInTheDocument();
    expect(screen.getByText('Caja')).toBeInTheDocument();
    expect(screen.queryByText('Configura tu cuenta')).toBeNull();           // nunca la pantalla de configurar mientras se acepta
    await user.click(screen.getByRole('button', { name: 'Aceptar invitación' }));
    await waitFor(() => expect(staff.calls).toContain(`accept:${TOKEN}`));
    await waitFor(() => expect(pendingInvitation()).toBeNull());
    expect(await screen.findByRole('navigation', { name: 'Principal' })).toBeInTheDocument();
  });

  it('una invitación que no es para esa cuenta o venció no se acepta y ofrece cambiar de cuenta', async () => {
    const staff = new FakeStaffRepository({ user: ana, memberships: [] });
    const { user } = await renderWith(<AppRoutes />, makeContainer({ staff }), `/invitacion?token=${TOKEN}`);
    expect(await screen.findByText('No pudimos abrir esta invitación')).toBeInTheDocument();
    expect(screen.getByText('Esta invitación no es válida, ya venció o es para otro correo.')).toBeInTheDocument();
    expect(staff.calls).not.toContain(`accept:${TOKEN}`);
    await user.click(screen.getByRole('button', { name: 'Cambiar de cuenta' }));
    expect(await screen.findByRole('heading', { name: /^Inicia sesión/ })).toBeInTheDocument();
  });

  it('muestra la contraseña que asignó el administrador, para copiarla; no deja elegir otra y pide confirmar que la guardó', async () => {
    const staff = new FakeStaffRepository({ user: ana, memberships: [] }); staff.previews[TOKEN] = preview; staff.initialPasswords[TOKEN] = 'Taza-azul-77';
    const { user } = await renderWith(<AppRoutes />, makeContainer({ staff }), `/invitacion?token=${TOKEN}`);
    expect(await screen.findByText('Esta es tu contraseña')).toBeInTheDocument();
    expect(screen.getByText('Taza-azul-77')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copiar contraseña' })).toBeInTheDocument();
    expect(screen.queryByText(/Crear una contraseña/)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Aceptar invitación' }));
    expect(await screen.findByText('Confirma que ya copiaste y guardaste tu contraseña.')).toBeInTheDocument();
    expect(staff.calls).not.toContain(`accept:${TOKEN}`);
    await user.click(screen.getByRole('checkbox', { name: 'Ya la copié y la guardé' }));
    await user.click(screen.getByRole('button', { name: 'Aceptar invitación' }));
    await waitFor(() => expect(staff.calls).toContain(`accept:${TOKEN}`));
  });

  it('si la persona ya tenía cuenta no se muestra ninguna contraseña', async () => {
    const staff = new FakeStaffRepository({ user: ana, memberships: [] }); staff.previews[TOKEN] = preview;
    await renderWith(<AppRoutes />, makeContainer({ staff }), `/invitacion?token=${TOKEN}`);
    await screen.findByRole('heading', { name: 'Te invitaron a Notaría 12' });
    expect(screen.queryByText('Esta es tu contraseña')).toBeNull();
  });

  it('sin sesión: pasa por el inicio de sesión y vuelve a la invitación (no a configurar la cuenta)', async () => {
    const staff = new FakeStaffRepository({ user: null, memberships: [] }); staff.previews[TOKEN] = preview;
    const { user } = await renderWith(<AppRoutes />, makeContainer({ staff }), `/invitacion?token=${TOKEN}`);
    expect(await screen.findByRole('heading', { name: /^Inicia sesión/ })).toBeInTheDocument();
    expect(pendingInvitation()).toBe(TOKEN);
    await user.type(screen.getByLabelText('Correo de trabajo'), 'ana@x.co');
    await user.type(screen.getByLabelText('Contraseña'), 'Taza-azul-77');
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(await screen.findByRole('heading', { name: 'Te invitaron a Notaría 12' })).toBeInTheDocument();
    expect(screen.queryByText('Configura tu cuenta')).toBeNull();
  });
});
