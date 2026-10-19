import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { badRequestFailure } from '@qhub/core';
import { SettingsPage } from './SettingsPage';
import { ana, FakeStaffRepository, org } from '@/testing/fakes';
import { makeContainer, renderWith } from '@/testing/harness';

const setup = async (o: { linked?: boolean; published?: boolean } = {}) => {
  const staff = new FakeStaffRepository({ user: ana, memberships: [{ organization: { ...org, linked: o.linked ?? false, published: o.published ?? false }, role: 'admin' }] });
  const container = makeContainer({ staff });
  return { staff, link: container.fakes.qhubLink, ...(await renderWith(<SettingsPage />, container)) };
};

describe('ajustes', () => {
  it('con la conexión ya guardada, publicar no vuelve a pedir la contraseña', async () => {
    const { link, user } = await setup({ linked: true });
    expect(await screen.findByText('Tu organización aún no aparece en la app móvil.')).toBeInTheDocument();
    expect(screen.getByText(/solo en el servidor/)).toBeInTheDocument();
    expect(screen.getByText('La conexión con Qhub está guardada en el servidor.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Publicar en la app móvil/ }));
    await waitFor(() => expect(link.calls).toContain('publish:org1'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(link.calls.some((c) => c.startsWith('connect:'))).toBe(false);
  });

  it('sin conexión guardada: se pide la cuenta Qhub una sola vez, se guarda y se publica', async () => {
    const { link, user } = await setup();
    expect(await screen.findByText('La conexión con Qhub es solo de esta sesión.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Publicar en la app móvil/ }));
    expect(screen.getByRole('dialog', { name: 'Conectar tu cuenta de Qhub' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Correo o usuario de Qhub'), 'notaria12');
    await user.type(screen.getAllByLabelText('Contraseña').at(-1)!, 'clave');
    await user.click(screen.getByRole('button', { name: 'Conectar y publicar' }));
    await waitFor(() => expect(link.calls).toEqual(expect.arrayContaining(['connect:org1:notaria12', 'publish:org1'])));
  });

  it('si Qhub rechaza la cuenta se explica el motivo y no se publica', async () => {
    const { link, user } = await setup();
    link.connectFailure = badRequestFailure('Usuario o contraseña de Qhub incorrectos');
    await user.click(await screen.findByRole('button', { name: /Publicar en la app móvil/ }));
    await user.type(screen.getByLabelText('Correo o usuario de Qhub'), 'notaria12'); await user.type(screen.getAllByLabelText('Contraseña').at(-1)!, 'mala');
    await user.click(screen.getByRole('button', { name: 'Conectar y publicar' }));
    expect(await screen.findByText('Usuario o contraseña de Qhub incorrectos')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Conectar tu cuenta de Qhub' })).toBeInTheDocument();      // la ventana sigue abierta para corregir
    expect(link.calls.some((c) => c.startsWith('publish:'))).toBe(false);
  });

  it('publicada: permite dejar de publicar con confirmación y conserva la conexión', async () => {
    const { link, user } = await setup({ linked: true, published: true });
    expect(await screen.findByText('Tu organización está publicada en la app móvil.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Dejar de publicar' }));
    await user.click(screen.getAllByRole('button', { name: 'Dejar de publicar' }).at(-1)!);
    await waitFor(() => expect(link.calls).toContain('unpublish:org1'));
    expect(link.calls.some((c) => c.startsWith('disconnect:'))).toBe(false);
  });

  it('olvidar la conexión guardada pide confirmar', async () => {
    const { link, user } = await setup({ linked: true });
    await user.click(await screen.findByRole('button', { name: 'Olvidar la conexión guardada' }));
    expect(screen.getByRole('dialog', { name: 'Olvidar la conexión guardada' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Olvidar conexión' }));
    await waitFor(() => expect(link.calls).toContain('disconnect:org1'));
  });

  it('guardar el nombre de la organización', async () => {
    const { staff, user } = await setup();
    const input = await screen.findByLabelText('Nombre');
    await user.clear(input); await user.type(input, 'Notaría 99');
    await user.click(screen.getByRole('button', { name: /Guardar$/ }));
    await waitFor(() => expect(staff.calls).toContain('updateOrg:Notaría 99'));
  });
});
