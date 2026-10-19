import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Logo } from './Icon';

/**
 * Última red de seguridad: si algo falla al dibujar la pantalla, la persona ve un mensaje claro y sin detalles técnicos.
 * El error real solo va a la consola de quien desarrolla; nunca se muestra el mensaje ni la traza.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  override componentDidCatch(error: unknown, info: ErrorInfo) { console.error('[qhub] error de pantalla', error, info.componentStack); }
  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main role="alert" className="grid min-h-full place-items-center bg-background p-6 text-text-primary">
        <div className="flex w-[min(440px,100%)] flex-col gap-4 border border-border-subtle bg-layer-01 p-8">
          <Logo height={28} />
          <h1 className="t-h2 m-0">Algo salió mal</h1>
          <p className="m-0 text-text-secondary">No pudimos mostrar esta pantalla. Tus datos están a salvo. Vuelve al inicio o recarga la página; si sigue pasando, avisa a quien administra tu cuenta.</p>
          <div className="flex flex-wrap gap-2">
            <a href="/inicio" className="inline-flex min-h-control-md items-center bg-interactive px-4 text-text-on-color no-underline">Volver al inicio</a>
            <button type="button" onClick={() => window.location.reload()} className="min-h-control-md cursor-pointer border border-link bg-transparent px-4 text-link">Recargar</button>
          </div>
        </div>
      </main>
    );
  }
}
