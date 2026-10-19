import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { cx } from './cx';
import { Icon } from './Icon';

interface ToastItem { id: number; message: string; title?: string; error: boolean; ms: number; action?: { label: string; onClick: () => void } }
interface ToastApi { show(message: string, opts?: { error?: boolean; title?: string; action?: { label: string; onClick: () => void } }): void }
const Ctx = createContext<ToastApi>({ show() {} });
export const useToast = () => useContext(Ctx);

/** Toasts flotantes: arriba a la derecha. Todos se cierran solos (los de error tardan más) con una línea que se va vaciando; al pasar el mouse se pausa. Un aviso repetido no se apila: reinicia el que ya está. */
export function ToastProvider({ children, durationMs = 6000 }: { children: ReactNode; durationMs?: number }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const dismiss = useCallback((id: number) => setItems((l) => l.filter((t) => t.id !== id)), []);
  const api = useMemo<ToastApi>(() => ({
    show(message, opts) {
      const id = Date.now() + Math.random();
      const error = !!opts?.error;
      setItems((l) => [...l.filter((t) => t.message !== message).slice(-2), { id, message, title: opts?.title, action: opts?.action, error, ms: error ? durationMs * 1.5 : durationMs }]);
    },
  }), [dismiss, durationMs]);
  return (
    <Ctx.Provider value={api}>
      {children}
      <div aria-live="polite" className="fixed right-4 top-4 z-[60] flex max-w-[420px] flex-col gap-2">
        {items.map((t) => (
          <div key={t.id} role={t.error ? 'alert' : 'status'} className={cx('toast relative flex items-start gap-2 overflow-hidden border-l-[3px] bg-brand-ink p-3 pb-4 text-white shadow-overlay', t.error ? 'border-l-error-on-ink' : 'border-l-brand-mint')}>
            <Icon name={t.error ? 'error' : t.title ? 'info' : 'check'} size={20} /><span className="min-w-0">{t.title && <strong className="block font-semibold">{t.title}</strong>}{t.message}{t.action && <button type="button" onClick={() => { t.action!.onClick(); dismiss(t.id); }} className="mt-1 block cursor-pointer border-0 bg-transparent p-0 text-left text-inherit underline">{t.action.label}</button>}</span>
            <button type="button" aria-label="Cerrar" onClick={() => dismiss(t.id)} className="ml-auto cursor-pointer border-0 bg-transparent text-inherit"><Icon name="close" /></button>
            <span aria-hidden onAnimationEnd={() => dismiss(t.id)} style={{ animationDuration: `${t.ms}ms` }} className="toast-bar absolute inset-x-0 bottom-0 h-[3px] origin-left bg-white" />
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
