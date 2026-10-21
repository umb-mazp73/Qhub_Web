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
    await user.click(await screen.findByRole('button', { name: /No se presentó/ }));
    expect(screen.getByRole('dialog', { name: 'Marcar como no presentado' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(c.fakes.tickets.calls).toEqual([]);
    await user.click(screen.getByRole('button', { name: /No se presentó/ }));
    await user.click(screen.getByRole('button', { name: 'Marcar no presentado' }));
    await waitFor(() => expect(c.fakes.tickets.calls).toEqual(['noShow:t1']));
  });

  it('«Solo finalizar» termina el turno sin llamar a nadie', async () => {
    const c = build();
    const { user } = await renderWith(<LiveBoard queueId="q1" queueName="Caja 1" />, c);
    await user.click(await screen.findByRole('button', { name: 'Solo finalizar' }));
    await waitFor(() => expect(c.fakes.tickets.calls).toEqual(['finish:t1']));
  });

  it('«Finalizar y llamar» termina el turno actual y llama al siguiente en un paso', async () => {
    const c = build();
    const { user } = await renderWith(<LiveBoard queueId="q1" queueName="Caja 1" />, c);
    await user.click(await screen.findByRole('button', { name: 'Finalizar y llamar a C-002' }));
    await waitFor(() => expect(c.fakes.tickets.calls).toEqual(['finish:t1', 'call:t2']));
    expect(await screen.findByText('Fila (1)')).toBeInTheDocument();
  });

  it('una cita que aún no llega no se llama sola: se avisa cuál es la próxima', async () => {
    const soon = new Date(Date.now() + 25 * 60_000);
    const c = build([makeTicket('t5', 5, 'en_espera', { position: 1, scheduled: true, slotStart: soon })]);
    await renderWith(<LiveBoard queueId="q1" queueName="Caja 1" />, c);
    expect(await screen.findByText('Nadie para llamar ahora')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Nadie para llamar ahora/ })).toBeDisabled();
    expect(screen.getByText(/La próxima cita es C-005 a las/)).toBeInTheDocument();
    expect(screen.getAllByText(/· en 25 min|· en 24 min/).length).toBeGreaterThan(0);
  });

  it('una cita cuya hora ya llegó se llama antes que un turno ahora', async () => {
    const c = build([
      makeTicket('ahora', 1, 'en_espera', { position: 1, createdAt: new Date(Date.now() - 20 * 60_000) }),
      makeTicket('cita', 2, 'en_espera', { position: 2, scheduled: true, slotStart: new Date(Date.now() - 2 * 60_000) }),
    ]);
    await renderWith(<LiveBoard queueId="q1" queueName="Caja 1" />, c);
    expect(await screen.findByRole('button', { name: 'Llamar siguiente · C-002' })).toBeInTheDocument();
    expect(screen.getByText(/ya es su hora/)).toBeInTheDocument();
  });

  it('muestra cuánto lleva el turno en atención y avisa si se pasó del tiempo', async () => {
    const c = build([makeTicket('t1', 1, 'atendiendo', { position: 0, calledAt: new Date(Date.now() - 14 * 60_000) })]);
    await renderWith(<LiveBoard queueId="q1" queueName="Caja 1" />, c);
    expect(await screen.findByRole('timer', { name: 'Tiempo de atención' })).toHaveTextContent(/Lleva 14 min/);
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
    await user.click(await screen.findByRole('button', { name: 'Solo finalizar' }));
    expect(await screen.findByText('Transición inválida')).toBeInTheDocument();
    expect(screen.getByText('Fila (2)')).toBeInTheDocument();
  });

  it('sin turnos en espera deshabilita el botón principal', async () => {
    await renderWith(<LiveBoard queueId="q1" queueName="Caja 1" />, build([makeTicket('t1', 1, 'finalizado')]));
    expect(await screen.findByText('No hay turnos en espera')).toBeInTheDocument();
    expect(screen.getByText('Nadie en espera')).toBeInTheDocument();
  });
});
