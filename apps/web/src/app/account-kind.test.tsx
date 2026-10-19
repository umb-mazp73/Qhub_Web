import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { AppRoutes } from '@/app/AppRoutes';
import { ana, FakeStaffRepository, MemoryTokenStore, personalMembership } from '@/testing/fakes';
import { makeContainer, renderWith } from '@/testing/harness';

const savedToken = (orgId: string) => { const s = new MemoryTokenStore(); s.save(orgId, { accessToken: 'guardado', expiresIn: 3600, issuedAt: new Date() }); return s; };
const personal = () => {
  const staff = new FakeStaffRepository({ user: ana, memberships: [personalMembership] });
  return { staff, container: makeContainer({ staff, tokenStore: savedToken('org-p') }) };
};

describe('alta: persona u organización', () => {
  it('por defecto es organización y se puede elegir persona', async () => {
    const staff = new FakeStaffRepository({ user: ana });
    const { user } = await renderWith(<AppRoutes />, makeContainer({ staff }));
    const org = await screen.findByRole('radio', { name: /Soy una organización/ });
    const person = screen.getByRole('radio', { name: /Soy una persona/ });
    expect(org).toBeChecked();
    expect(screen.getByLabelText('Nombre de la organización')).toBeInTheDocument();
    await user.click(person);
    expect(person).toBeChecked();
    expect(screen.getByLabelText('Nombre con el que te verá el público')).toBeInTheDocument();
    expect(screen.getByText(/hasta 3 colas y sin equipo/)).toBeInTheDocument();
  });

  it('crear una cuenta personal envía el tipo "persona" y valida el nombre', async () => {
    const staff = new FakeStaffRepository({ user: ana });
    const { user } = await renderWith(<AppRoutes />, makeContainer({ staff }));
    await user.click(await screen.findByRole('radio', { name: /Soy una persona/ }));
    await user.click(screen.getByRole('button', { name: /Crear mi cuenta/ }));
    expect(screen.getByText('Escribe el nombre de tu cuenta (el nombre con el que te verá el público).')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Nombre con el que te verá el público'), 'Dra. Ana Gómez');
    await user.click(screen.getByRole('button', { name: /Crear mi cuenta/ }));
    await waitFor(() => expect(staff.calls).toContain('createOrg:Dra. Ana Gómez:persona'));
  });

  it('en una cuenta personal Qhub se registra como "usuario", sin nombre de empresa', async () => {
    const staff = new FakeStaffRepository({ user: ana, memberships: [personalMembership] });
    const container = makeContainer({ staff });
    const { user } = await renderWith(<AppRoutes />, container);
    expect(await screen.findByText(/Usa tu cuenta Qhub personal/)).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Crear cuenta' }));
    await user.type(screen.getByLabelText('Nombre'), 'Ana'); await user.type(screen.getByLabelText('Apellido'), 'Gómez');
    await user.type(screen.getByLabelText('Usuario de Qhub'), 'anagomez'); await user.type(screen.getByLabelText('Correo'), 'ana@x.co');
    await user.type(screen.getAllByLabelText('Contraseña').at(-1)!, 'clave-segura-1');
    await user.click(screen.getByRole('combobox', { name: 'País' })); await user.click(await screen.findByRole('option', { name: 'Ecuador' }));
    await user.click(screen.getByRole('combobox', { name: 'Ciudad' })); await user.click(await screen.findByRole('option', { name: 'Quito' }));
    await user.click(screen.getByLabelText(/Acepto los términos/));
    await user.click(screen.getByRole('button', { name: /Crear cuenta y conectar/ }));
    await waitFor(() => expect(container.fakes.auth.registrations).toHaveLength(1));
    expect(container.fakes.auth.registrations[0]).toMatchObject({ accountType: 'usuario' });
    expect(container.fakes.auth.registrations[0]!.companyName).toBeUndefined();
  });
});

describe('cuenta personal en la plataforma', () => {
  it('no tiene equipo: sin menú ni ruta de equipo, y el menú dice «Mi cuenta»', async () => {
    const { container } = personal();
    await renderWith(<AppRoutes />, container, '/equipo');
    expect(await screen.findByRole('heading', { level: 1, name: /Ana/ })).toBeInTheDocument();        // /equipo la devuelve al inicio
    const nav = screen.getByRole('navigation', { name: 'Principal' });
    expect(within(nav).queryByText('Equipo')).toBeNull();
    expect(within(nav).getByText('Mi cuenta')).toBeInTheDocument();
    expect(within(nav).getByText('Ajustes')).toBeInTheDocument();
    expect(within(nav).getByText('Clientes')).toBeInTheDocument();
  });

  it('el inicio habla de "cuenta personal" y no pide invitar equipo', async () => {
    const { container } = personal();
    await renderWith(<AppRoutes />, container);
    expect(await screen.findByText(/Dra\. Ana Gómez · Cuenta personal/)).toBeInTheDocument();
    expect(await screen.findByText('Completar los datos de tu cuenta')).toBeInTheDocument();
    expect(screen.getByText('Publicar tu cuenta en la app móvil')).toBeInTheDocument();
    expect(screen.queryByText('Invitar a tu equipo')).toBeNull();
    expect(screen.queryByRole('button', { name: /Invitar equipo/ })).toBeNull();
    expect(screen.queryByText('Equipo activo')).toBeNull();
  });

  it('los ajustes usan el lenguaje de una persona', async () => {
    const { container } = personal();
    await renderWith(<AppRoutes />, container, '/ajustes');
    expect(await screen.findByText('Tu cuenta personal')).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre con el que te ve el público')).toBeInTheDocument();
    expect(screen.getByText(/Tu cuenta aún no aparece en la app móvil/)).toBeInTheDocument();
  });

  it('el perfil muestra «Titular» como rol', async () => {
    const { container } = personal();
    await renderWith(<AppRoutes />, container, '/perfil?tab=cuenta');
    expect(await screen.findByText('Titular')).toBeInTheDocument();
    expect(screen.getByText(/No tiene equipo/)).toBeInTheDocument();
  });
});
