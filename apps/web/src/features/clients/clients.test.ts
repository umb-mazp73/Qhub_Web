import { describe, expect, it } from 'vitest';
import { clientName, clientsToCsv, clientStats, filterClients, noShowRate } from '@/features/clients/clients';

describe('clientes (dominio)', () => {
  const now = new Date('2026-10-17T12:00:00Z');
  const c = (id: string, o: object = {}) => ({ userId: id, firstName: 'Carla', lastName: 'Mena', email: 'carla@x.co', phone: null, firstSeen: new Date('2026-10-15T12:00:00Z'), lastTicket: new Date('2026-10-16T12:00:00Z'), tickets: 4, served: 2, noShow: 2, cancelled: 0, follows: true, blocked: false, ...o });
  it('filtra sin distinguir tildes ni mayúsculas', () => {
    const list = [c('1'), c('2', { firstName: 'José', lastName: 'Pérez', email: null, follows: false, blocked: true, noShow: 0, firstSeen: new Date('2026-01-01') })];
    expect(filterClients(list, { query: 'jose', filter: 'todos', now }).map((x) => x.userId)).toEqual(['2']);
    expect(filterClients(list, { query: '', filter: 'bloqueados', now }).map((x) => x.userId)).toEqual(['2']);
    expect(filterClients(list, { query: '', filter: 'nuevos', now }).map((x) => x.userId)).toEqual(['1']);
    expect(filterClients(list, { query: '', filter: 'con_no_show', now }).map((x) => x.userId)).toEqual(['1']);
    expect(filterClients(list, { query: 'carla@', filter: 'siguen', now })).toHaveLength(1);
  });
  it('estadísticas, tasa y CSV (sin contacto si no llegó)', () => {
    const list = [c('1'), c('2', { follows: false, blocked: true, email: null, lastTicket: null })];
    expect(clientStats(list, now)).toEqual({ total: 2, active30: 1, new7: 2, blocked: 1, follow: 1 });
    expect(noShowRate(list[0]!)).toBe(0.5); expect(clientName({ firstName: '', lastName: '' })).toBe('Sin nombre');
    const csv = clientsToCsv(list);
    expect(csv.split('\n')[0]).toContain('nombre,correo'); expect(csv).toContain('Carla Mena,carla@x.co'); expect(csv).toContain(',si\n');
  });
});
