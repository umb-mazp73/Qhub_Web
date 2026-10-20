import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { AppRoutes } from '@/app/AppRoutes';
import { agentMembership, ana, FakeStaffRepository, MemoryTokenStore } from '@/testing/fakes';
import { makeContainer, renderWith } from '@/testing/harness';

const savedToken = () => { const s = new MemoryTokenStore(); s.save('org1', { accessToken: 'guardado', expiresIn: 3600, issuedAt: new Date() }); return s; };

// Invitado con clave asignada por el administrador (passwordAssigned) y permiso aprobado: fija una contraseña NUEVA
// sin tener que saber la actual. El gate de permiso del administrador no cambia.
describe('SecurityTab: el invitado con clave asignada fija una contraseña nueva sin la actual', () => {
  const openAssigned = async () => {
    const staff = new FakeStaffRepository({ user: { ...ana, passwordAssigned: true }, memberships: [agentMembership] });
    staff.permission = { status: 'aprobada', expiresAt: new Date(Date.now() + 864e5) };
    const c = makeContainer({ staff, tokenStore: savedToken() });
    const r = await renderWith(<AppRoutes />, c, '/perfil?tab=seguridad');
    await screen.findByText('Tu administrador aprobó el cambio.');
    return { ...r, staff, security: c.fakes.security };
  };

  it('no muestra el campo «Contraseña actual»', async () => {
    await openAssigned();
    expect(screen.queryByLabelText('Contraseña actual')).toBeNull();
    expect(screen.getByLabelText('Contraseña nueva')).toBeInTheDocument();
    expect(screen.getByLabelText('Repite la contraseña nueva')).toBeInTheDocument();
  });

  it('si la nueva y su confirmación no coinciden, lo dice y no llama a setPassword', async () => {
    const { user, security } = await openAssigned();
    await user.type(screen.getByLabelText('Contraseña nueva'), 'Taza-azul-77');
    await user.type(screen.getByLabelText('Repite la contraseña nueva'), 'Taza-roja-88');
    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
    expect(await screen.findByText('Las contraseñas no coinciden.')).toBeInTheDocument();
    expect(security.calls.some((x) => x.startsWith('setPassword'))).toBe(false);
  });

  it('con datos válidos llama security.setPassword(nueva) una vez y no changePassword', async () => {
    const { user, security } = await openAssigned();
    await user.type(screen.getByLabelText('Contraseña nueva'), 'Taza-azul-77');
    await user.type(screen.getByLabelText('Repite la contraseña nueva'), 'Taza-azul-77');
    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
    await waitFor(() => expect(security.calls).toContain('setPassword:Taza-azul-77'));
    expect(security.calls.some((x) => x.startsWith('changePassword'))).toBe(false);
  });
});

describe('SecurityTab: quien conoce su contraseña conserva el flujo clásico (contraseña actual)', () => {
  it('con passwordAssigned ausente muestra «Contraseña actual» y usa changePassword', async () => {
    const staff = new FakeStaffRepository({ user: ana, memberships: [agentMembership] });   // sin passwordAssigned
    staff.permission = { status: 'aprobada', expiresAt: new Date(Date.now() + 864e5) };
    const c = makeContainer({ staff, tokenStore: savedToken() });
    const { user } = await renderWith(<AppRoutes />, c, '/perfil?tab=seguridad');
    await screen.findByText('Tu administrador aprobó el cambio.');
    expect(screen.getByLabelText('Contraseña actual')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Contraseña actual'), 'Vieja-clave-12');
    await user.type(screen.getByLabelText('Contraseña nueva'), 'Taza-azul-77');
    await user.type(screen.getByLabelText('Repite la contraseña nueva'), 'Taza-azul-77');
    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
    await waitFor(() => expect(c.fakes.security.calls).toContain('changePassword:Vieja-clave-12'));
    expect(c.fakes.security.calls.some((x) => x.startsWith('setPassword'))).toBe(false);
  });
});
