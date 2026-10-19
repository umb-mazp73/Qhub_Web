import { describe, expect, it } from 'vitest';
import { failureFromSupabase, Failure, unauthorizedFailure } from '../src';

const auth = (message: string, status?: number) => Object.assign(new Error(message), { name: 'AuthApiError', status });
const kind = (e: unknown) => failureFromSupabase(e).kind;

describe('failureFromSupabase', () => {
  it('deja pasar un Failure tal cual', () => { const f = unauthorizedFailure(); expect(failureFromSupabase(f)).toBe(f); });
  it('traduce los errores de autenticación', () => {
    expect(failureFromSupabase(auth('Invalid login credentials')).message).toBe('Correo o contraseña incorrectos.');
    expect(kind(auth('User already registered'))).toBe('conflict');
    expect(failureFromSupabase(auth('User already registered')).message).toBe('Ese correo ya está registrado. Inicia sesión o recupera tu contraseña.');
    expect(kind(auth('Email not confirmed'))).toBe('bad_request');
    expect(kind(auth('Password should be at least 8 characters'))).toBe('validation');
    expect(kind(auth('Invalid TOTP code entered'))).toBe('validation');
    expect(kind(auth('anything', 429))).toBe('rate_limited');
    expect(kind(auth('otro'))).toBe('bad_request');                                   // texto crudo de la librería: genérico
  });
  it('traduce los códigos de PostgREST/Postgres', () => {
    expect(kind({ code: '42501', message: 'x' })).toBe('forbidden'); expect(kind({ code: '23505' })).toBe('conflict'); expect(kind({ code: 'P0002', message: 'no' })).toBe('not_found');
    expect(kind({ code: '23514', message: 'regla' })).toBe('validation'); expect(kind({ code: '28000' })).toBe('unauthorized'); expect(kind({ code: 'XX000' })).toBe('server');
  });
  it('sin red o desconocido', () => {
    expect(kind(new TypeError('Failed to fetch'))).toBe('network'); expect(kind({ message: 'network down' })).toBe('network'); expect(kind(null)).toBe('unknown');
    expect(failureFromSupabase({}) instanceof Failure).toBe(true);
  });
});
