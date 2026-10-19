import { colors, type ColorTokens, type ThemeName } from './tokens.generated';
import type { TicketStatus } from '@qhub/api-client';

export const getColors = (theme: ThemeName): ColorTokens => colors[theme];

type StatusColors = { fill: string; text: string };
/** Relleno del badge (texto encima: `textOnAccent`) y color como texto/ícono sobre superficie. */
export function statusColors(status: TicketStatus, c: ColorTokens): StatusColors {
  switch (status) {
    case 'en_espera': return { fill: c.stateWaiting, text: c.stateWaitingText };
    case 'atendiendo': return { fill: c.stateServing, text: c.stateServingText };
    case 'finalizado': return { fill: c.stateDone, text: c.stateDoneText };
    case 'cancelado': return { fill: c.stateCancelled, text: c.stateCancelledText };
    case 'no_show': return { fill: c.stateNoshow, text: c.stateNoshowText };
  }
}

export const STATUS_ICON: Record<TicketStatus, 'clock' | 'play' | 'check' | 'close' | 'noshow'> = {
  en_espera: 'clock', atendiendo: 'play', finalizado: 'check', cancelado: 'close', no_show: 'noshow',
};

/** Contraste WCAG entre dos colores hex (#rrggbb). */
export function contrast(a: string, b: string): number {
  const lum = (h: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [l1, l2] = [lum(a), lum(b)];
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
