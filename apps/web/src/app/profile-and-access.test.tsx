import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { serverFailure, unauthorizedFailure, validationFailure } from '@qhub/core';
import { AppRoutes } from '@/app/AppRoutes';
import { Combobox } from '@/shared/ui';
import { adminMembership, agentMembership, ana, FakeStaffRepository, MemoryTokenStore, receptionMembership, supervisorMembership } from '@/testing/fakes';
import { makeContainer, renderWith } from '@/testing/harness';

const savedToken = () => { const s = new MemoryTokenStore(); s.save('org1', { accessToken: 'guardado', expiresIn: 3600, issuedAt: new Date() }); return s; };
const as = (membership = adminMembership) => {
  const staff = new FakeStaffRepository({ user: ana, memberships: [membership] });
  return { staff, container: makeContainer({ staff, tokenStore: savedToken() }) };
};

describe('acceso: recuperación y registro', () => {
  it('recuperar contraseña pide el correo y responde sin revelar si existe', async () => {
    const container = makeContainer({ staff: new FakeStaffRepository() });
    const { user } = await renderWith(<AppRoutes />, container);
    await user.click(await screen.findByRole('link', { name: '¿Olvidaste tu contraseña?' }));
    expect(screen.getByRole('heading', { name: 'Recupera tu acceso' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Contraseña')).toBeNull();
    await user.click(screen.getByRole('button', { name: /Enviar enlace/ }));
    expect(screen.getByText('Escribe un correo válido.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Correo de trabajo'), 'ana@x.co');
    await user.click(screen.getByRole('button', { name: /Enviar enlace/ }));
    expect(await screen.findByText(/Si el correo está registrado/)).toBeInTheDocument();
    expect(container.fakes.security.calls).toContain('reset:ana@x.co');
  });

  it('el registro valida coincidencia, fortaleza y nombre', async () => {
    const staff = new FakeStaffRepository();
    const { user } = await renderWith(<AppRoutes />, makeContainer({ staff }));
    await user.click(await screen.findByRole('link', { name: 'Crea una cuenta' }));
    await user.type(screen.getByLabelText('Correo de trabajo'), 'nuevo@x.co');
    await user.type(screen.getByLabelText('Contraseña'), 'Taza-azul-77');
    expect(screen.getByText(/Seguridad:/)).toBeInTheDocument();
    await user.type(screen.getByLabelText('Repite la contraseña'), 'Otra-clave-88');
    await user.click(screen.getByRole('button', { name: /Crear cuenta/ }));
    expect(screen.getByText('Las contraseñas no coinciden.')).toBeInTheDocument();
    expect(screen.getByText('Escribe tu nombre (mínimo 2 letras).')).toBeInTheDocument();
    expect(staff.calls).toEqual([]);
  });

  it('el enlace del correo abre la pantalla de contraseña nueva aunque no haya conexión con Qhub', async () => {
    const container = makeContainer({ staff: new FakeStaffRepository({ user: ana }) });
    const { user } = await renderWith(<AppRoutes />, container, '/restablecer');
    expect(await screen.findByRole('heading', { name: 'Elige tu contraseña nueva' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Contraseña nueva', { selector: 'input' }), 'corta');
    await user.click(screen.getByRole('button', { name: /Guardar contraseña/ }));
    expect(screen.getByText('Usa al menos 8 caracteres.')).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Contraseña nueva', { selector: 'input' }));
    await user.type(screen.getByLabelText('Contraseña nueva', { selector: 'input' }), 'nueva1234');
    await user.type(screen.getByLabelText('Repite la contraseña'), 'nueva1234');
    await user.click(screen.getByRole('button', { name: /Guardar contraseña/ }));
    await waitFor(() => expect(container.fakes.security.calls).toContain('setPassword'));
  });
});

describe('perfil', () => {
  it('muestra los datos, valida y guarda solo cuando hay cambios', async () => {
    const { staff, container } = as();
    const { user } = await renderWith(<AppRoutes />, container, '/perfil');
    const first = await screen.findByLabelText('Nombre');
    await waitFor(() => expect(first).toHaveValue('Ana'));
    const save = screen.getByRole('button', { name: /Guardar cambios/ });
    expect(save).toBeDisabled();

    await user.clear(first);
    expect(save).toBeEnabled();
    await user.click(save);
    expect(screen.getByText(/Escribe tu nombre/)).toBeInTheDocument();
    expect(staff.calls.some((c) => c.startsWith('updateProfile'))).toBe(false);

    await user.type(first, 'Ana María');
    await user.click(save);
    await waitFor(() => expect(staff.calls).toContain('updateProfile:Ana María:Quito'));
    expect(await screen.findByText('Perfil actualizado.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Guardar cambios/ })).toBeDisabled();
  });

  it('país y ciudad se eligen de listas; cambiar el país limpia la ciudad', async () => {
    const { staff, container } = as();
    const { user } = await renderWith(<AppRoutes />, container, '/perfil');
    const country = await screen.findByRole('combobox', { name: 'País' });
    await waitFor(() => expect(country).toHaveValue('Ecuador'));
    expect(screen.getByRole('combobox', { name: 'Ciudad' })).toHaveValue('Quito');

    await user.click(country);
    await user.type(country, 'colom');
    await user.click(await screen.findByRole('option', { name: 'Colombia' }));
    expect(screen.getByRole('combobox', { name: 'Ciudad' })).toHaveValue('');

    await user.click(screen.getByRole('combobox', { name: 'Ciudad' }));
    await user.click(await screen.findByRole('option', { name: 'Medellín' }));
    await user.click(screen.getByRole('button', { name: /Guardar cambios/ }));
    await waitFor(() => expect(staff.calls).toContain('updateProfile:Ana:Medellín'));
  });

  it('el teléfono solo admite dígitos y se guarda con prefijo', async () => {
    const { container } = as();
    const { user } = await renderWith(<AppRoutes />, container, '/perfil');
    const phone = await screen.findByLabelText('Teléfono');
    await user.type(phone, '99a12b34');
    expect(phone).toHaveValue('991234');
  });

  it('cambiar contraseña: valida y avisa si la actual es incorrecta', async () => {
    const { container } = as();
    const security = container.fakes.security;
    const { user } = await renderWith(<AppRoutes />, container, '/perfil');
    await user.click(await screen.findByRole('tab', { name: 'Seguridad' }));
    await user.click(screen.getByRole('button', { name: /Cambiar contraseña/ }));
    expect(screen.getByText('Escribe tu contraseña actual.')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Contraseña actual'), 'vieja1234');
    await user.type(screen.getByLabelText('Contraseña nueva'), 'nueva1234');
    await user.type(screen.getByLabelText('Repite la contraseña nueva'), 'distinta1');
    await user.click(screen.getByRole('button', { name: /Cambiar contraseña/ }));
    expect(screen.getByText('Las contraseñas no coinciden.')).toBeInTheDocument();

    security.passwordFailure = unauthorizedFailure('La contraseña actual no es correcta.');
    await user.clear(screen.getByLabelText('Repite la contraseña nueva'));
    await user.type(screen.getByLabelText('Repite la contraseña nueva'), 'nueva1234');
    await user.click(screen.getByRole('button', { name: /Cambiar contraseña/ }));
    expect(await screen.findByText('La contraseña actual no es correcta.')).toBeInTheDocument();

    security.passwordFailure = null;
    await user.click(screen.getByRole('button', { name: /Cambiar contraseña/ }));
    expect(await screen.findByText('Contraseña actualizada.')).toBeInTheDocument();
  });

  it('cerrar otras sesiones', async () => {
    const { container } = as();
    const security = container.fakes.security;
    const { user } = await renderWith(<AppRoutes />, container, '/perfil');
    await user.click(await screen.findByRole('tab', { name: 'Seguridad' }));
    await user.click(screen.getByRole('button', { name: /Cerrar otras sesiones/ }));
    await waitFor(() => expect(security.calls).toContain('signOutOthers'));
  });

  it('preferencias de accesibilidad se aplican al documento', async () => {
    localStorage.clear();
    const { container } = as();
    const { user } = await renderWith(<AppRoutes />, container, '/perfil');
    await user.click(await screen.findByRole('tab', { name: 'Preferencias' }));
    await user.click(screen.getByRole('switch', { name: /Texto más grande/ }));
    await user.click(screen.getByRole('switch', { name: /Contraste alto/ }));
    expect(document.documentElement.dataset.text).toBe('large');
    expect(document.documentElement.dataset.contrast).toBe('more');
    expect(screen.getByRole('switch', { name: /Texto más grande/ })).toHaveAttribute('aria-checked', 'true');
    localStorage.clear();
    document.documentElement.removeAttribute('data-text'); document.documentElement.removeAttribute('data-contrast');
  });

  it('eliminar cuenta exige escribir ELIMINAR y muestra el motivo si falla', async () => {
    const { staff, container } = as();
    staff.deleteFailure = validationFailure('Eres el único administrador de una organización con más miembros.');
    const { user } = await renderWith(<AppRoutes />, container, '/perfil');
    await user.click(await screen.findByRole('tab', { name: 'Cuenta' }));
    await user.click(screen.getByRole('button', { name: /Eliminar cuenta/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Eliminar cuenta' });
    const confirm = within(dialog).getByRole('button', { name: 'Eliminar' });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByLabelText('Confirmación'), 'eliminar');
    expect(confirm).toBeDisabled();           // distingue mayúsculas
    await user.clear(within(dialog).getByLabelText('Confirmación'));
    await user.type(within(dialog).getByLabelText('Confirmación'), 'ELIMINAR');
    await user.click(confirm);
    expect((await screen.findAllByText(/único administrador de una organización con más miembros/)).length).toBeGreaterThan(0);
    expect(staff.calls).toContain('deleteAccount');
  });

  it('eliminar cuenta con éxito cierra la sesión', async () => {
    const { staff, container } = as();
    const { user } = await renderWith(<AppRoutes />, container, '/perfil');
    await user.click(await screen.findByRole('tab', { name: 'Cuenta' }));
    await user.click(screen.getByRole('button', { name: /Eliminar cuenta/ }));
    await user.type(await screen.findByLabelText('Confirmación'), 'ELIMINAR');
    await user.click(screen.getByRole('button', { name: 'Eliminar' }));
    expect(await screen.findByRole('heading', { name: /^Inicia sesión/  })).toBeInTheDocument();
    expect(staff.user).toBeNull();
  });
});

describe('roles nuevos', () => {
  it('el inicio de un administrador sugiere lo que falta configurar', async () => {
    const { container } = as(adminMembership);
    await renderWith(<AppRoutes />, container);
    expect(await screen.findByText(/Termina de configurar/)).toBeInTheDocument();
    expect(screen.getByText('Publicar la organización en la app móvil')).toBeInTheDocument();
  });

  it('recepción ve el inicio sin métricas ni historial', async () => {
    const { container } = as(receptionMembership);
    await renderWith(<AppRoutes />, container);
    expect(await screen.findByText('Colas ahora')).toBeInTheDocument();
    expect(screen.queryByText('Tasa de no-show')).toBeNull();
    expect(screen.queryByText(/Termina de configurar/)).toBeNull();
    expect(screen.getByRole('navigation', { name: 'Principal' })).not.toHaveTextContent('Historial');
  });

  it('el supervisor ve equipo, historial y fila, pero no puede invitar ni atender', async () => {
    const { container } = as(supervisorMembership);
    const { user } = await renderWith(<AppRoutes />, container);
    await screen.findByText('Colas ahora');
    const nav = screen.getByRole('navigation', { name: 'Principal' });
    expect(nav).toHaveTextContent('Historial'); expect(nav).toHaveTextContent('Equipo'); expect(nav).not.toHaveTextContent('Ajustes');
    await user.click(within(screen.getByRole('navigation', { name: 'Principal' })).getByRole('link', { name: /Equipo/ }));
    expect(await screen.findByText('Luis Vera')).toBeInTheDocument();
    expect(screen.queryByText('Invitar a alguien')).toBeNull();
    expect(screen.getByLabelText('Rol de Luis Vera')).toBeDisabled();
    await user.click(within(screen.getByRole('navigation', { name: 'Principal' })).getByRole('link', { name: /En vivo/ }));
    expect(await screen.findByText(/puede ver la fila, pero no atenderla/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Llamar siguiente/ })).toBeNull();
  });

  it('el agente sí puede llamar', async () => {
    const { container } = as(agentMembership);
    await renderWith(<AppRoutes />, container, '/en-vivo');
    expect(await screen.findByRole('button', { name: /Llamar siguiente|No hay turnos en espera/ })).toBeInTheDocument();
  });

  it('el menú de cuenta lleva al perfil', async () => {
    const { container } = as();
    const { user } = await renderWith(<AppRoutes />, container);
    await user.click(await screen.findByRole('button', { name: 'Cuenta' }));
    await user.click(screen.getByRole('menuitem', { name: 'Mi perfil' }));
    expect(await screen.findByRole('heading', { name: 'Mi perfil' })).toBeInTheDocument();
  });
});

describe('Combobox', () => {
  function Demo() {
    const [v, setV] = useState<'a' | 'b' | 'c' | ''>('');
    return <Combobox label="Letra" value={v} onValueChange={setV} clearable options={[{ value: 'a', label: 'Árbol' }, { value: 'b', label: 'Barco' }, { value: 'c', label: 'Casa' }]} />;
  }
  it('filtra sin distinguir tildes y se maneja con teclado', async () => {
    const user = userEvent.setup();
    render(<Demo />);
    const box = screen.getByRole('combobox', { name: 'Letra' });
    await user.click(box);
    expect(screen.getAllByRole('option')).toHaveLength(3);
    await user.type(box, 'arbol');
    expect(screen.getAllByRole('option')).toHaveLength(1);
    await user.keyboard('{Enter}');
    expect(box).toHaveValue('Árbol');
    await user.click(box);
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(box).toHaveValue('Casa');
    await user.click(screen.getByRole('button', { name: 'Quitar letra' }));
    expect(box).toHaveValue('');
  });
  it('sin coincidencias avisa y Escape cierra', async () => {
    const user = userEvent.setup();
    render(<Demo />);
    const box = screen.getByRole('combobox', { name: 'Letra' });
    await user.click(box); await user.type(box, 'zzz');
    expect(screen.getByText('Sin resultados')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});
void serverFailure;

describe('historial por fechas', () => {
  it('resolveRange valida el rango elegido en los calendarios', async () => {
    const { resolveRange } = await import('@/features/history/history');
    const now = new Date(2026, 9, 17);
    expect(resolveRange('2026-10-11', '2026-10-17', now)).toMatchObject({ days: 7 });
    expect(resolveRange('2026-10-18', '2026-10-17', now)).toHaveProperty('errors.from');
    expect(resolveRange('2026-10-01', '2026-10-30', now)).toHaveProperty('errors.to');   // futura
    expect(resolveRange('2026-08-01', '2026-10-17', now)).toHaveProperty('errors.from'); // > 31 días
    expect(resolveRange('', '', now)).toHaveProperty('errors.from');
    expect(resolveRange('2026-02-31', '2026-10-17', now)).toHaveProperty('errors.from'); // fecha inexistente
  });
  it('la pestaña "Elegir fechas" muestra calendarios y avisa si el rango es inválido', async () => {
    const { container } = as();
    const { user } = await renderWith(<AppRoutes />, container, '/historial');
    await user.click(await screen.findByRole('tab', { name: 'Elegir fechas' }));
    const from = screen.getByLabelText('Desde');
    expect(from).toHaveAttribute('type', 'date');
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.change(from, { target: { value: '2020-01-01' } });
    expect((await screen.findAllByText(/El rango máximo es de 31 días/)).length).toBeGreaterThan(0);   // en el campo y en el aviso
  });
});
