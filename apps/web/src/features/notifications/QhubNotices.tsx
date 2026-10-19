import { useQhubNotifications } from './useQhubNotifications';

/** Monta la escucha de avisos personales de Qhub. Sin UI propia (como `NoticePopups`). */
export function QhubNotices() {
  useQhubNotifications();
  return null;
}
