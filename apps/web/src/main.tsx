import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary, ToastProvider } from '@/shared/ui';
import { App } from './app/App';
import { parseEnv } from './app/env';
import { buildContainer, ContainerProvider } from './app/container';

const root = createRoot(document.getElementById('root')!);
try {
  const container = buildContainer(parseEnv(import.meta.env as Record<string, string | undefined>));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, staleTime: 5_000 } } });
  container.session.onReconnected = () => { void client.invalidateQueries(); };   // el token se renovó solo: se vuelve a pedir lo que falló
  container.session.start();
  root.render(
    <StrictMode>
      <ErrorBoundary><ContainerProvider value={container}>
        <QueryClientProvider client={client}>
          <ToastProvider><BrowserRouter><App /></BrowserRouter></ToastProvider>
        </QueryClientProvider>
      </ContainerProvider></ErrorBoundary>
    </StrictMode>,
  );
} catch (e) {
  // El detalle (p. ej. qué variable falta) es para quien desarrolla: va a la consola, no a la pantalla.
  console.error('[qhub] no se pudo iniciar', e);
  root.render(<p role="alert" style={{ padding: 32 }}>No pudimos iniciar la aplicación. Inténtalo de nuevo en un momento o avisa a quien administra tu cuenta.</p>);
}
