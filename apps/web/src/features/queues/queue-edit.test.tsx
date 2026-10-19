import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { conflictFailure } from '@qhub/core';
import { QueueEditPage } from '@/features/queues/QueueEditPage';
import { adminMembership, ana, FakeStaffRepository } from '@/testing/fakes';
import { makeContainer, renderWith } from '@/testing/harness';

const setup = async (route: string, prefixes: Record<string, string> = {}) => {
  const staff = new FakeStaffRepository({ user: ana, memberships: [adminMembership] });
  staff.prefixes = prefixes;
  const c = makeContainer({ staff });
  const utils = await renderWith(
    <Routes><Route path="/colas/nueva" element={<QueueEditPage />} /><Route path="/colas/:id" element={<QueueEditPage />} /><Route path="/colas" element={<p>LISTA DE COLAS</p>} /></Routes>, c, route);
  return { c, ...utils };
};
const waitReady = async () => { await waitFor(() => expect(screen.getByRole('button', { name: /Guardar cola/ })).toBeEnabled()); };

describe('prefijo del turno sugerido', () => {
  it('se propone solo a partir del nombre y se muestran alternativas', async () => {
    const { user } = await setup('/colas/nueva');
    await waitReady();
    const prefix = screen.getByLabelText('Prefijo del turno');
    expect(screen.queryByRole('group', { name: 'Prefijos sugeridos' })).toBeNull();      // sin nombre no hay sugerencias
    await user.type(screen.getByLabelText('Nombre de la cola'), 'Atención al cliente');
    expect(prefix).toHaveValue('A');
    const chips = within(screen.getByRole('group', { name: 'Prefijos sugeridos' })).getAllByRole('button').map((b) => b.textContent);
    expect(chips).toEqual(expect.arrayContaining(['A', 'AC']));
    expect(screen.getByText('Turnos A-001…')).toBeInTheDocument();
  });

  it('la persona puede elegir una sugerencia o escribir la suya, y entonces deja de seguir al nombre', async () => {
    const { user } = await setup('/colas/nueva');
    await waitReady();
    const prefix = screen.getByLabelText('Prefijo del turno');
    await user.type(screen.getByLabelText('Nombre de la cola'), 'Caja');
    await user.click(within(screen.getByRole('group', { name: 'Prefijos sugeridos' })).getByRole('button', { name: 'CJ' }));
    expect(prefix).toHaveValue('CJ');
    await user.type(screen.getByLabelText('Nombre de la cola'), 's rápidas');         // ya lo tocó: no se pisa
    expect(prefix).toHaveValue('CJ');
    await user.clear(prefix); await user.type(prefix, 'x1z9');                        // solo letras, mayúsculas, máximo 2
    expect(prefix).toHaveValue('XZ');
  });

  it('no sugiere los prefijos de otras colas y avisa si se elige uno repetido', async () => {
    const { user } = await setup('/colas/nueva', { q9: 'C' });
    await waitReady();
    await user.type(screen.getByLabelText('Nombre de la cola'), 'Caja');
    expect(screen.getByLabelText('Prefijo del turno')).toHaveValue('CA');              // la C ya está en uso
    await user.clear(screen.getByLabelText('Prefijo del turno')); await user.type(screen.getByLabelText('Prefijo del turno'), 'c');
    expect(screen.getByText(/Ya lo usa otra cola/)).toBeInTheDocument();
  });

  it('al editar una cola existente conserva su prefijo aunque cambie el nombre', async () => {
    const { user } = await setup('/colas/q1', { q1: 'Z' });
    await screen.findByDisplayValue('Caja 1');
    await waitFor(() => expect(screen.getByLabelText('Prefijo del turno')).toHaveValue('Z'));
    await user.type(screen.getByLabelText('Nombre de la cola'), ' nueva');
    expect(screen.getByLabelText('Prefijo del turno')).toHaveValue('Z');
  });
});

describe('crear cola', () => {
  it('valida el nombre y el horario antes de ir a la red', async () => {
    const { c, user } = await setup('/colas/nueva');
    await waitReady();
    await user.click(screen.getByRole('button', { name: /Guardar cola/ }));
    expect(screen.getByText('Escribe el nombre de la cola (mínimo 2 caracteres).')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Nombre de la cola'), 'Cajas');
    await user.click(screen.getByRole('combobox', { name: 'Cierre' }));   // hora en 24 h, se elige de la lista
    await user.click(await screen.findByRole('option', { name: '07:00' }));
    await user.click(screen.getByRole('button', { name: /Guardar cola/ }));
    expect(screen.getByText('El cierre debe ser posterior a la apertura.')).toBeInTheDocument();
    expect(c.fakes.queues.lastCreate).toBeNull();
  });

  it('el resumen se calcula y se envía el horario con el prefijo por defecto', async () => {
    const { c, user } = await setup('/colas/nueva');
    await waitReady();
    await user.type(screen.getByLabelText('Nombre de la cola'), 'Cajas');
    await user.selectOptions(screen.getByLabelText('Puestos en paralelo'), '2');   // se elige, no se escribe
    expect(screen.getByText('Cupos por franja').nextSibling).toHaveTextContent('6'); // 30 / 10 × 2
    await user.click(screen.getByRole('button', { name: /Guardar cola/ }));
    expect(await screen.findByText('LISTA DE COLAS')).toBeInTheDocument();
    const input = c.fakes.queues.lastCreate!;
    expect(input.name).toBe('Cajas');
    expect(input.schedule).toMatchObject({ opens: '08:00', closes: '17:00', days: [1, 2, 3, 4, 5], stations: 2 });
    expect(c.fakes.staff.prefixes.q2).toBe('C');
    expect(c.fakes.staff.audits).toEqual(['cola.crear']);
  });

  it('un 409 de la API se muestra sin salir de la pantalla', async () => {
    const { c, user } = await setup('/colas/nueva');
    c.fakes.queues.createFailure = conflictFailure('Ya tienes una cola con ese nombre.');
    await waitReady();
    await user.type(screen.getByLabelText('Nombre de la cola'), 'Caja 1');
    await user.click(screen.getByRole('button', { name: /Guardar cola/ }));
    expect(await screen.findByText('Ya tienes una cola con ese nombre.')).toBeInTheDocument();
    expect(screen.queryByText('LISTA DE COLAS')).toBeNull();
  });

  it('los días se pueden quitar y el resumen cambia', async () => {
    const { user } = await setup('/colas/nueva');
    await waitReady();
    const before = screen.getByText('Turnos por semana').nextSibling!.textContent;
    await user.click(screen.getByRole('button', { name: 'Día X' }));
    expect(screen.getByRole('button', { name: 'Día X' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('Turnos por semana').nextSibling!.textContent).not.toBe(before);
  });
});

describe('editar cola', () => {
  it('carga la cola y su horario; eliminar pide confirmación', async () => {
    const { c, user } = await setup('/colas/q1');
    expect(await screen.findByDisplayValue('Caja 1')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Apertura' })).toHaveValue('08:00');
    await user.click(screen.getByRole('button', { name: /Eliminar cola/ }));
    expect(screen.getByText(/Se archiva "Caja 1"/)).toBeInTheDocument();
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }));
    expect(c.fakes.queues.calls).not.toContain('delete:q1');
    await user.click(screen.getByRole('button', { name: /Eliminar cola/ }));
    await user.click(within_dialog('Eliminar cola'));
    await waitFor(() => expect(c.fakes.queues.calls).toContain('delete:q1'));
    expect(c.fakes.staff.audits).toContain('cola.archivar');
  });

  it('guardar reemplaza el horario completo (PUT)', async () => {
    const { c, user } = await setup('/colas/q1');
    await screen.findByDisplayValue('Caja 1');
    await user.selectOptions(screen.getByLabelText('Tope diario de turnos'), '50');
    await user.click(screen.getByRole('button', { name: /Guardar cola/ }));
    await waitFor(() => expect(c.fakes.queues.lastSchedule?.dailyCapacity).toBe(50));
    expect(c.fakes.queues.lastSchedule?.stations).toBe(2);
    expect(c.fakes.queues.calls).toContain('update:q1:Caja 1:undefined');
  });
});

function within_dialog(name: string) { return screen.getAllByRole('button', { name }).at(-1)!; }
