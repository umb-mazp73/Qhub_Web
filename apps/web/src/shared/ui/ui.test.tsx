import { describe, expect, it, vi } from 'vitest';
import { screen, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button, ConfirmDialog, EmptyState, ErrorBoundary, TextField, TurnBadge, TurnNumber } from '@/shared/ui';

describe('design system (web)', () => {
  it('TurnBadge muestra palabra para cada estado (nunca solo color)', () => {
    render(<>{(['en_espera', 'atendiendo', 'finalizado', 'cancelado', 'no_show'] as const).map((s) => <TurnBadge key={s} status={s} />)}</>);
    for (const l of ['En espera', 'Atendiendo', 'Finalizado', 'Cancelado', 'No-show']) expect(screen.getByText(l)).toBeInTheDocument();
  });
  it('TurnNumber formatea A-023', () => { render(<TurnNumber number={23} prefix="E" />); expect(screen.getByText('E-023')).toBeInTheDocument(); });
  it('TextField: label asociado, error con aria-invalid y mostrar contraseña', async () => {
    render(<TextField label="Contraseña" type="password" revealable error="Muy corta" />);
    const input = screen.getByLabelText('Contraseña');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('type', 'password');
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar' }));
    expect(input).toHaveAttribute('type', 'text');
    expect(screen.getByText('Muy corta')).toBeInTheDocument();
  });
  it('Button deshabilitado o cargando no dispara onClick', async () => {
    let n = 0;
    render(<><Button onClick={() => n++}>Ok</Button><Button disabled onClick={() => (n += 100)}>Off</Button><Button loading onClick={() => (n += 100)}>Wait</Button></>);
    await userEvent.click(screen.getByRole('button', { name: 'Ok' }));
    await userEvent.click(screen.getByRole('button', { name: 'Off' }));
    await userEvent.click(screen.getByRole('button', { name: /Wait/ }));
    expect(n).toBe(1);
  });
  it('ConfirmDialog: Escape cancela y el foco entra al diálogo', async () => {
    let cancelled = false;
    render(<ConfirmDialog title="Eliminar" message="¿Seguro?" confirmLabel="Eliminar" onConfirm={() => {}} onCancel={() => { cancelled = true; }} />);
    expect(screen.getByRole('dialog')).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(cancelled).toBe(true);
  });
  it('EmptyState', () => { render(<EmptyState title="Crea tu primera cola" message="Aún no tienes colas." />); expect(screen.getByText('Crea tu primera cola')).toBeInTheDocument(); });
});

describe('ErrorBoundary', () => {
  it('si una pantalla falla, muestra un mensaje claro sin detalles técnicos', () => {
    const Boom = (): never => { throw new Error('relation "perfiles" does not exist at /app/src/x.ts:10'); };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<ErrorBoundary><Boom /></ErrorBoundary>);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Algo salió mal');
    expect(alert).not.toHaveTextContent(/relation|perfiles|\.ts|undefined|Error:/);
    expect(screen.getByRole('link', { name: 'Volver al inicio' })).toHaveAttribute('href', '/inicio');
  });
  it('sin errores deja pasar el contenido', () => { render(<ErrorBoundary><p>todo bien</p></ErrorBoundary>); expect(screen.getByText('todo bien')).toBeInTheDocument(); });
});
