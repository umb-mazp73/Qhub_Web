import { describe, expect, it } from 'vitest';
import { badRequestFailure } from '@qhub/core';
import { screen, waitFor } from '@testing-library/react';
import { ReconnectBanner } from './ReconnectBanner';
import { adminMembership, agentMembership, ana, FakeStaffRepository, org } from '@/testing/fakes';
import { makeContainer, renderWith } from '@/testing/harness';

// La organización ya confirmó la conexión con Qhub; en esta sesión no hay token y no hay conexión guardada,
// así que el estado queda «desconectado» y el banner se muestra (needed === true).
const connectedOrg = { ...org, qhubConnected: true };
const adminOnConnected = { ...adminMembership, organization: connectedOrg };
const agentOnConnected = { ...agentMembership, organization: connectedOrg };

describe('ReconnectBanner: reconectar con Qhub según el rol', () => {
  it('administrador: pulsar «Reconectar» abre la ventana de credenciales (como antes)', async () => {
    const staff = new FakeStaffRepository({ user: ana, memberships: [adminOnConnected] });
    const c = makeContainer({ staff });
    const { user } = await renderWith(<ReconnectBanner />, c, '/inicio');
    await user.click(await screen.findByRole('button', { name: 'Reconectar' }));
    expect(await screen.findByRole('dialog', { name: 'Reconectar con Qhub' })).toBeInTheDocument();
    expect(c.fakes.qhubLink.calls.filter((x) => x.startsWith('notifyReconnect'))).toEqual([]);
  });

  it('integrante no admin con reconexión exitosa: reconecta en silencio y avisa «Conectado con Qhub.», sin ventana ni aviso al admin', async () => {
    const staff = new FakeStaffRepository({ user: ana, memberships: [agentOnConnected] });
    const c = makeContainer({ staff });   // el FakeQhubLink.issueToken responde ok por defecto -> autoConnect reconecta
    const { user } = await renderWith(<ReconnectBanner />, c, '/inicio');
    await user.click(await screen.findByRole('button', { name: 'Reconectar' }));
    expect(await screen.findByText('Conectado con Qhub.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Reconectar con Qhub' })).toBeNull();
    expect(c.fakes.qhubLink.calls.filter((x) => x.startsWith('notifyReconnect'))).toEqual([]);
  });

  it('integrante no admin con fallo: muestra el aviso en español y notifica al administrador una sola vez', async () => {
    const staff = new FakeStaffRepository({ user: ana, memberships: [agentOnConnected] });
    const c = makeContainer({ staff });
    c.fakes.qhubLink.issueFailure = badRequestFailure('Qhub no responde.');   // falla la reconexión por servidor
    const { user } = await renderWith(<ReconnectBanner />, c, '/inicio');
    await user.click(await screen.findByRole('button', { name: 'Reconectar' }));
    expect(await screen.findByText('Le avisamos a tu administrador para que reconecte la cuenta de Qhub.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Reconectar con Qhub' })).toBeNull();
    await waitFor(() => expect(c.fakes.qhubLink.calls.filter((x) => x === `notifyReconnect:${connectedOrg.id}`)).toHaveLength(1));
  });
});
