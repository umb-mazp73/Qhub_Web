import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { AppRoutes } from '@/app/AppRoutes';
import { adminMembership, ana, FakeStaffRepository, MemoryTokenStore } from '@/testing/fakes';
import { makeContainer, renderWith } from '@/testing/harness';

const savedToken = () => { const s = new MemoryTokenStore(); s.save('org1', { accessToken: 'guardado', expiresIn: 3600, issuedAt: new Date() }); return s; };

async function openTeam(staff = new FakeStaffRepository({ user: ana, memberships: [adminMembership] })) {
  const r = await renderWith(<AppRoutes />, makeContainer({ staff, tokenStore: savedToken() }), '/equipo');
  await screen.findByText('Ana Gómez (tú)');
  return { ...r, staff };
}

describe('equipo: ver la contraseña asignada de un miembro', () => {
  it('muestra la contraseña asignada y el aviso de posible desactualización', async () => {
    const staff = new FakeStaffRepository({ user: ana, memberships: [adminMembership] });
    staff.memberInitialPasswords['u2'] = 'Taza-azul-77';
    const { user } = await openTeam(staff);
    await user.click(screen.getByRole('button', { name: 'Ver contraseña' }));
    expect(await screen.findByText('Contraseña asignada de Luis Vera')).toBeInTheDocument();
    expect(screen.getByText('Taza-azul-77')).toBeInTheDocument();
    expect(screen.getByText('Es la contraseña inicial que asignaste.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copiar contraseña' })).toBeInTheDocument();
    expect(staff.calls).toContain('memberInitialPassword:u2');
  });

  it('muestra un mensaje amable cuando no hay contraseña asignada visible', async () => {
    const staff = new FakeStaffRepository({ user: ana, memberships: [adminMembership] });
    const { user } = await openTeam(staff);
    await user.click(screen.getByRole('button', { name: 'Ver contraseña' }));
    expect(await screen.findByText('Contraseña asignada de Luis Vera')).toBeInTheDocument();
    expect(screen.getByText('Este miembro no tiene una contraseña asignada visible (quizá la cambió). Puedes restablecerla.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copiar contraseña' })).toBeNull();
    expect(staff.calls).toContain('memberInitialPassword:u2');
  });
});
