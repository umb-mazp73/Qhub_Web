import { describe, expect, it } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import { conflictFailure } from '@qhub/core';
import { LiveBoard } from '@/features/live/LivePage';
import { adminMembership, ana, FakeStaffRepository, FakeTicketRepository, makeTicket } from '@/testing/fakes';
import { makeContainer, renderWith } from '@/testing/harness';

const build = (tickets = [
  makeTicket('t1', 1, 'atendiendo', { position: 0 }), makeTicket('t2', 2, 'en_espera', { position: 1 }),
  makeTicket('t3', 3, 'en_espera', { position: 2 }), makeTicket('t0', 9, 'finalizado'),
]) => {
  const staff = new FakeStaffRepository({ user: ana, memberships: [adminMembership] });
  staff.prefixes.q1 = 'C';
  return makeContainer({ staff, tickets: new FakeTicketRepository(tickets) });
};

describe('fila en vivo', () => {
  it('muestra lo que se atiende, la fila y los contadores', async () => {
    await renderWith(<LiveBoard queueId="q1" queueName="Caja 1" />, build());
    expect(await screen.findByText('Atendiendo ahora')).toBeInTheDocument();
    expect(await screen.findByText('Llamar siguiente · C-002')).toBeInTheDocument();
    expect(screen.getByText('Fila (2)')).toBeInTheDocument();
    expect(screen.getAllByText('C-001').length).toBeGreaterThan(0);
  });

  it('"Llamar siguiente" llama al primero en espera y la fila se actualiza', async () => {
    const c = build();
    const { user } = await renderWith(<LiveBoard queueId="q1" queueName="Caja 1" />, c);
    await user.click(await screen.findByRole('button', { name: /Llamar siguiente · C-002/ }));
    await waitFor(() => expect(c.fakes.tickets.calls).toEqual(['call:t2']));
    expect(await screen.findByText('Fila (1)')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Llamar siguiente · C-003/ })).toBeInTheDocument();
  });

  it('no-show pide confirmación; cancelar no ejecuta nada', async () => {
    const c = build();
    const { user } = await renderWith(<LiveBoard queueId="q1" queueName="Caja 1" />, c);
    await user.click(await screen.findByRole('button', { name: /No-show/ }));
    expect(screen.getByRole('dialog', { name: 'Marcar no-show' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(c.fakes.tickets.calls).toEqual([]);
    await user.click(screen.getByRole('button', { name: /No-show/ }));
    await user.click(screen.getByRole('button', { name: 'Marcar no-show' }));
    await waitFor(() => expect(c.fakes.tickets.calls).toEqual(['noShow:t1']));
  });

  it('finalizar', async () => {
    const c = build();
    const { user } = await renderWith(<LiveBoard queueId="q1" queueName="Caja 1" />, c);
    await user.click(await screen.findByRole('button', { name: /Finalizar/ }));
    await waitFor(() => expect(c.fakes.tickets.calls).toEqual(['finish:t1']));
  });

  it('un evento en vivo agrega un turno a la fila', async () => {
    const c = build();
    await renderWith(<LiveBoard queueId="q1" queueName="Caja 1" />, c);
    await screen.findByText('Fila (2)');
    act(() => c.fakes.realtime.emit({ type: 'turno_creado', queueId: 'q1', ticket: makeTicket('t9', 4, 'en_espera', { position: 3 }) }));
    expect(await screen.findByText('Fila (3)')).toBeInTheDocument();
    expect(screen.getByText('C-004')).toBeInTheDocument();
  });

  it('un error de la API al actuar se muestra y no cambia la fila', async () => {
    const c = build();
    c.fakes.tickets.actionFailure = conflictFailure('Transición inválida');
    const { user } = await renderWith(<LiveBoard queueId="q1" queueName="Caja 1" />, c);
    await user.click(await screen.findByRole('button', { name: /Finalizar/ }));
    expect(await screen.findByText('Transición inválida')).toBeInTheDocument();
    expect(screen.getByText('Fila (2)')).toBeInTheDocument();
  });

  it('sin turnos en espera deshabilita el botón principal', async () => {
    await renderWith(<LiveBoard queueId="q1" queueName="Caja 1" />, build([makeTicket('t1', 1, 'finalizado')]));
    expect(await screen.findByText('No hay turnos en espera')).toBeInTheDocument();
    expect(screen.getByText('Nadie en espera')).toBeInTheDocument();
  });
});
