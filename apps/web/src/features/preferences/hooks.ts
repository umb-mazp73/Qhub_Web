import { useSyncExternalStore } from 'react';
import { getPreferences, subscribePreferences } from './preferences';

export const usePreferences = () => useSyncExternalStore(subscribePreferences, getPreferences);

/** Valor para `refetchInterval` de TanStack Query según la preferencia de actualización automática. */
export function useRefreshInterval(): number | false {
  const { refreshSeconds } = usePreferences();
  return refreshSeconds === 0 ? false : refreshSeconds * 1000;
}
