import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useContainer } from './container';
import { AppRoutes } from './AppRoutes';
import { applyPreferences, loadPreferences } from '@/features/preferences/preferences';

export { applyTheme, loadTheme, type ThemeMode } from '@/features/preferences/preferences';

export function App() {
  const [ready, setReady] = useState(false);
  const qc = useQueryClient();
  const { session } = useContainer();
  // Si entra otra cuenta (también desde otra pestaña), no queda ningún dato en memoria de la anterior.
  useEffect(() => session.onUserChange(() => qc.clear()), [session, qc]);
  useEffect(() => { applyPreferences(loadPreferences()); setReady(true); }, []);
  return ready ? <AppRoutes /> : null;
}
