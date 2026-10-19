import type { IconName } from '@qhub/design';
import { cx, Icon, IconButton } from '@/shared/ui';
import { NOTICE_KIND_LABEL, type StaffNotice } from './notifications';
import { timeAgo } from '@qhub/core';

const ICON: Record<StaffNotice['kind'], IconName> = { equipo: 'user', cliente: 'ticket', sistema: 'info' };

/** Un aviso: ícono + tipo en palabra + título + mensaje + hora. No leído = punto y la palabra «Nuevo» (no solo color). */
export function NoticeRow({ notice, onOpen, onRead, onRemove, compact }: { notice: StaffNotice; onOpen: (n: StaffNotice) => void; onRead?: (n: StaffNotice) => void; onRemove?: (n: StaffNotice) => void; compact?: boolean }) {
  return (
    <li className={cx('flex items-start gap-3 border-t border-border-subtle first:border-t-0', compact ? 'px-4 py-3' : 'py-3', !notice.read && 'bg-layer-02')}>
      <span className={cx('mt-0.5 shrink-0', notice.read ? 'text-text-secondary' : 'text-link')}><Icon name={ICON[notice.kind]} size={20} /></span>
      <button type="button" onClick={() => onOpen(notice)} className="min-w-0 flex-1 cursor-pointer border-0 bg-transparent p-0 text-left text-inherit">
        <span className="flex items-center gap-2">
          <span className={cx('truncate', !notice.read && 'font-semibold')}>{notice.title}</span>
          {!notice.read && <span className="t-label shrink-0 bg-interactive px-1.5 text-text-on-color">Nuevo</span>}
        </span>
        <span className="block text-text-secondary">{notice.message}</span>
        <span className="t-caption text-text-secondary">{NOTICE_KIND_LABEL[notice.kind]} · {timeAgo(notice.createdAt)}</span>
      </button>
      {!compact && (
        <span className="flex shrink-0 items-center">
          {!notice.read && onRead && <IconButton icon="check" label={`Marcar como leído: ${notice.title}`} onClick={() => onRead(notice)} />}
          {onRemove && <IconButton icon="trash" label={`Eliminar: ${notice.title}`} onClick={() => onRemove(notice)} />}
        </span>
      )}
    </li>
  );
}
