import { describe, expect, it } from 'vitest';
import { badRequestFailure, failureFromSupabase, friendlyError, isSafeMessage, notFoundFailure, safeMessage, serverFailure, validationFailure, GENERIC_ERROR } from '../src';

describe('mensajes seguros', () => {
  it('deja pasar mensajes humanos en español', () => {
    for (const m of ['Tu sesión venció. Inicia sesión de nuevo.', 'Invitación inválida, vencida o para otro correo', 'Esa franja está llena.', 'Eres el único administrador de una organización con más miembros.', 'Usuario o contraseña de Qhub incorrectos'])
      expect(isSafeMessage(m), m).toBe(true);
  });

  it('rechaza lo técnico: tablas, restricciones, servicios, rutas, tokens, trazas e inglés crudo', () => {
    const bad = [
      'new row for relation "perfiles" violates check constraint "perfiles_pais_check"', 'duplicate key value violates unique constraint "organizaciones_slug_key"',
      'permission denied for table organizacion_credenciales', 'JWT expired', 'Invalid API key', 'connect ECONNREFUSED 127.0.0.1:8000', 'https://dsxmehbusarzkgxzverg.supabase.co/rest/v1/perfiles',
      'TypeError: Cannot read properties of undefined', 'Failed to fetch', 'nombre_usuario: String should have at least 3 characters', 'Field required', '{"detail":"x"}',
      'Error en RabbitMQ: cola qhub.dlq', 'at Object.run (/app/main.ts:10:5)', 'Bearer eyJhbGciOi', 'x'.repeat(300), 'línea 1\nlínea 2', '', '   ',
    ];
    for (const m of bad) expect(isSafeMessage(m), m).toBe(false);
    expect(isSafeMessage(undefined)).toBe(false); expect(isSafeMessage(42)).toBe(false);
  });

  it('safeMessage usa el genérico cuando no es seguro', () => { expect(safeMessage('relation "x" does not exist', 'Algo salió mal.')).toBe('Algo salió mal.'); expect(safeMessage('Todo bien.', 'x')).toBe('Todo bien.'); });

  it('un Failure nunca lleva un mensaje técnico: se reemplaza por el de su tipo', () => {
    expect(badRequestFailure('violates check constraint "x"').message).toBe('La solicitud no es válida. Revisa los datos.');
    expect(notFoundFailure('relation "turnos" does not exist').message).toBe('No encontramos lo que buscas.');
    expect(serverFailure('connect ECONNREFUSED 10.0.0.5:5432').message).toMatch(/Algo salió mal de nuestro lado/);
    expect(validationFailure('Password should be at least 8 characters').message).toBe('Revisa los datos ingresados.');
    expect(badRequestFailure('Revisa el horario.').message).toBe('Revisa el horario.');
  });
  it('los mensajes por campo también se filtran', () => {
    const f = validationFailure('Revisa los datos.', { nombre: 'Escribe tu nombre.', cola_id: 'field required', ok: 'String should have at least 3 characters' });
    expect(f.fields).toEqual({ nombre: 'Escribe tu nombre.' });
  });

  it('friendlyError: el de un Failure o uno genérico; nunca el texto crudo de un Error cualquiera', () => {
    expect(friendlyError(badRequestFailure('Revisa los datos.'))).toBe('Revisa los datos.');
    expect(friendlyError(new TypeError('Cannot read properties of undefined (reading "x")'))).toBe(GENERIC_ERROR);
    expect(friendlyError('texto suelto', 'Otro')).toBe('Otro'); expect(friendlyError(null)).toBe(GENERIC_ERROR);
  });

  it('un error crudo de Supabase o de la red nunca llega tal cual', () => {
    for (const e of [{ code: '23514', message: 'new row for relation "perfiles" violates check constraint "perfiles_pais_check"' }, { code: 'XX000', message: 'boom at db.internal' }, new TypeError('Failed to fetch'), { name: 'AuthApiError', message: 'Some internal auth thing' }])
      expect(failureFromSupabase(e).message, JSON.stringify(e)).not.toMatch(/perfiles|constraint|internal|fetch|relation/i);
  });
});
