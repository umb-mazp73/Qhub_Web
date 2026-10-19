// GENERADO por scripts/generate.mjs desde tokens/tokens.json y assets/. No editar a mano.

export const colors = {
  "light": {
    "brandIndigo": "#3b4eff",
    "brandInk": "#0e1330",
    "brandMint": "#00d1b2",
    "neutral10": "#f4f5f8",
    "neutral20": "#e0e3eb",
    "neutral50": "#8b91a5",
    "neutral70": "#5b6078",
    "neutral90": "#161a2e",
    "background": "#f4f5f8",
    "layer01": "#ffffff",
    "layer02": "#f4f5f8",
    "layerHover": "#e8eaf0",
    "layerSelected": "#e0e3eb",
    "field": "#f4f5f8",
    "borderSubtle": "#e0e3eb",
    "borderStrong": "#767c95",
    "textPrimary": "#161a2e",
    "textSecondary": "#5b6078",
    "textPlaceholder": "#676d8c",
    "textDisabled": "#a6abbc",
    "textOnColor": "#ffffff",
    "textOnAccent": "#0e1330",
    "interactive": "#3b4eff",
    "interactiveHover": "#2e40e6",
    "interactiveActive": "#2333c2",
    "link": "#3b4eff",
    "linkOnInk": "#8c98ff",
    "errorOnInk": "#f26368",
    "focus": "#3b4eff",
    "focusInset": "#ffffff",
    "sidebarBg": "#0e1330",
    "sidebarHover": "#1e2448",
    "sidebarActive": "#262d5a",
    "sidebarText": "#b4b9cc",
    "sidebarTextActive": "#ffffff",
    "stateWaiting": "#ffb020",
    "stateWaitingText": "#8a5a00",
    "stateServing": "#00d1b2",
    "stateServingText": "#00786a",
    "stateDone": "#1fa866",
    "stateDoneText": "#157a49",
    "stateCancelled": "#8b91a5",
    "stateCancelledText": "#5b6078",
    "stateNoshow": "#e5484d",
    "stateNoshowText": "#c42b31",
    "supportError": "#c42b31",
    "supportSuccess": "#157a49",
    "supportWarning": "#8a5a00",
    "supportInfo": "#3b4eff",
    "overlay": "#0e133099",
    "skeletonBg": "#e0e3eb",
    "skeletonShine": "#eceef3"
  },
  "dark": {
    "brandIndigo": "#3b4eff",
    "brandInk": "#0e1330",
    "brandMint": "#00d1b2",
    "neutral10": "#f4f5f8",
    "neutral20": "#e0e3eb",
    "neutral50": "#8b91a5",
    "neutral70": "#5b6078",
    "neutral90": "#161a2e",
    "background": "#0e1330",
    "layer01": "#161a2e",
    "layer02": "#1e2340",
    "layerHover": "#252b4a",
    "layerSelected": "#2a3054",
    "field": "#1e2340",
    "borderSubtle": "#2a3050",
    "borderStrong": "#7a809c",
    "textPrimary": "#f4f5f8",
    "textSecondary": "#b4b9cc",
    "textPlaceholder": "#8b91a5",
    "textDisabled": "#4a5070",
    "textOnColor": "#ffffff",
    "textOnAccent": "#0e1330",
    "interactive": "#3b4eff",
    "interactiveHover": "#2e40e6",
    "interactiveActive": "#2333c2",
    "link": "#8c98ff",
    "linkOnInk": "#8c98ff",
    "errorOnInk": "#f26368",
    "focus": "#ffffff",
    "focusInset": "#0e1330",
    "sidebarBg": "#0a0d22",
    "sidebarHover": "#1a1f3c",
    "sidebarActive": "#232a52",
    "sidebarText": "#b4b9cc",
    "sidebarTextActive": "#ffffff",
    "stateWaiting": "#ffb020",
    "stateWaitingText": "#ffb020",
    "stateServing": "#00d1b2",
    "stateServingText": "#00d1b2",
    "stateDone": "#1fa866",
    "stateDoneText": "#1fa866",
    "stateCancelled": "#8b91a5",
    "stateCancelledText": "#8b91a5",
    "stateNoshow": "#e5484d",
    "stateNoshowText": "#f26368",
    "supportError": "#f26368",
    "supportSuccess": "#1fa866",
    "supportWarning": "#ffb020",
    "supportInfo": "#8c98ff",
    "overlay": "#05071299",
    "skeletonBg": "#252b4a",
    "skeletonShine": "#2f3657"
  }
} as const;

export type ColorName = keyof typeof colors.light;
export type ColorTokens = { readonly [K in ColorName]: string };
export type ThemeName = keyof typeof colors;

/** Para qué sirve cada token de color (del design system). */
export const colorUsage: Record<ColorName, string> = {
  "brandIndigo": "Qhub Indigo, primario de marca. Relleno de la acción principal, logo y selección. Como texto solo sobre layer-01/background en claro (5.6:1); en oscuro usa link.",
  "brandInk": "Ink de marca. Sidebar, cabeceras oscuras, texto sobre turn-mint y sobre fills de estado.",
  "brandMint": "Turn Mint, acento. Solo como relleno o marca (indicador activo, \"en vivo\", cola del logo); nunca texto sobre claro (1.9:1). Texto encima: brand-ink.",
  "neutral10": "Neutro base de la paleta. Fondo claro.",
  "neutral20": "Neutro de bordes sutiles y divisores.",
  "neutral50": "Neutro medio. Estado Cancelado, íconos inactivos en oscuro.",
  "neutral70": "Neutro de texto secundario en claro.",
  "neutral90": "Neutro de texto principal en claro y capa base en oscuro.",
  "background": "Fondo de página / lienzo de la app.",
  "layer01": "Superficie de tiles, tablas, modales y paneles sobre background.",
  "layer02": "Superficie anidada dentro de layer-01 (cabecera de tabla, bloque secundario).",
  "layerHover": "Hover de filas, ítems de menú y botones ghost.",
  "layerSelected": "Fila o ítem seleccionado.",
  "field": "Fondo de inputs, selects y selector de fecha (estilo campo con borde inferior).",
  "borderSubtle": "Divisores y bordes de tiles; nunca como único límite de un control.",
  "borderStrong": "Borde inferior de campos y bordes de controles. 3.8:1 sobre field claro, 3.9:1 sobre field oscuro.",
  "textPrimary": "Texto principal sobre background, layer-01, layer-02 y field.",
  "textSecondary": "Texto secundario, labels y helper sobre background, layer-01, layer-02 (≥5:1).",
  "textPlaceholder": "Placeholder en field (4.6:1 claro, 4.9:1 oscuro). Nunca sustituye al label.",
  "textDisabled": "Texto deshabilitado (exento de contraste por WCAG). Siempre con cursor not-allowed.",
  "textOnColor": "Texto e íconos sobre brand-indigo, interactive-hover y support-error.",
  "textOnAccent": "Texto sobre brand-mint y sobre todos los fills de estado (state-*).",
  "interactive": "Botón primario, tab activo, checkbox marcado, borde de selección.",
  "interactiveHover": "Hover del botón primario (texto blanco 7:1).",
  "interactiveActive": "Pressed del botón primario.",
  "link": "Enlaces y botón ghost/tertiary. 5.2:1 sobre background claro, 6.6:1 sobre layer-01 oscuro.",
  "linkOnInk": "Enlaces, info y sintaxis de código sobre brand-ink y sidebar-bg (7:1).",
  "errorOnInk": "Error/No-show como ícono o texto sobre brand-ink (5.9:1).",
  "focus": "Anillo de foco de 2 px en todos los controles; ≥3:1 sobre todas las superficies.",
  "focusInset": "Separador interior de 1 px entre el foco y un relleno indigo.",
  "sidebarBg": "Navegación lateral del admin y del sitio de docs.",
  "sidebarHover": "Hover de ítems del sidebar.",
  "sidebarActive": "Ítem activo del sidebar (con indicador brand-mint de 3 px a la izquierda).",
  "sidebarText": "Texto de ítems del sidebar sobre sidebar-bg (≥7:1).",
  "sidebarTextActive": "Texto del ítem activo y del logo sobre sidebar-bg.",
  "stateWaiting": "Estado En espera. Relleno de badge y barras; texto encima text-on-accent (9.9:1).",
  "stateWaitingText": "\"En espera\" como texto/ícono sobre layer-01 y background.",
  "stateServing": "Estado Atendiendo (= brand-mint). Relleno; texto encima text-on-accent (9.3:1).",
  "stateServingText": "\"Atendiendo\" como texto/ícono sobre layer-01 y background.",
  "stateDone": "Estado Finalizado. Relleno; texto encima text-on-accent (5.9:1).",
  "stateDoneText": "\"Finalizado\" como texto/ícono sobre layer-01 y background.",
  "stateCancelled": "Estado Cancelado. Relleno; texto encima text-on-accent (5.8:1).",
  "stateCancelledText": "\"Cancelado\" como texto/ícono sobre layer-01 y background.",
  "stateNoshow": "Estado No-show. Relleno; texto encima text-on-accent (4.7:1).",
  "stateNoshowText": "\"No-show\" como texto/ícono sobre layer-01 y background.",
  "supportError": "Errores de formulario: borde del campo, ícono y mensaje. Texto blanco sobre él solo en claro.",
  "supportSuccess": "Confirmaciones (toast de éxito, check).",
  "supportWarning": "Advertencias.",
  "supportInfo": "Información.",
  "overlay": "Velo detrás de modales.",
  "skeletonBg": "Fondo del esqueleto de carga.",
  "skeletonShine": "Brillo animado del esqueleto."
};

export const spacing = {
  "s01": 2,
  "s02": 4,
  "s03": 8,
  "s04": 12,
  "s05": 16,
  "s06": 24,
  "s07": 32,
  "s08": 40,
  "s09": 48,
  "s10": 64,
  "s11": 80
} as const;
export const size = {
  "controlSm": 32,
  "controlMd": 40,
  "controlLg": 48,
  "headerHeight": 48,
  "sidebarWidth": 256,
  "rowHeight": 48
} as const;
export const radius = {
  "s0": 0,
  "sm": 2,
  "md": 4,
  "round": 999
} as const;

export interface TextStyleToken { family: 'sans' | 'mono'; fontSize: number; lineHeight: number; fontWeight: number; letterSpacing: number }
export const text = {
  "display": {
    "family": "sans",
    "fontSize": 54,
    "lineHeight": 64,
    "fontWeight": 300,
    "letterSpacing": -0.5
  },
  "h1": {
    "family": "sans",
    "fontSize": 32,
    "lineHeight": 40,
    "fontWeight": 400,
    "letterSpacing": 0
  },
  "h2": {
    "family": "sans",
    "fontSize": 28,
    "lineHeight": 36,
    "fontWeight": 400,
    "letterSpacing": 0
  },
  "h3": {
    "family": "sans",
    "fontSize": 20,
    "lineHeight": 28,
    "fontWeight": 400,
    "letterSpacing": 0
  },
  "h4": {
    "family": "sans",
    "fontSize": 16,
    "lineHeight": 24,
    "fontWeight": 600,
    "letterSpacing": 0
  },
  "body": {
    "family": "sans",
    "fontSize": 14,
    "lineHeight": 20,
    "fontWeight": 400,
    "letterSpacing": 0.16
  },
  "bodyLong": {
    "family": "sans",
    "fontSize": 16,
    "lineHeight": 24,
    "fontWeight": 400,
    "letterSpacing": 0
  },
  "label": {
    "family": "sans",
    "fontSize": 12,
    "lineHeight": 16,
    "fontWeight": 500,
    "letterSpacing": 0.32
  },
  "caption": {
    "family": "sans",
    "fontSize": 12,
    "lineHeight": 16,
    "fontWeight": 400,
    "letterSpacing": 0.32
  },
  "turnXl": {
    "family": "mono",
    "fontSize": 64,
    "lineHeight": 72,
    "fontWeight": 500,
    "letterSpacing": 0
  },
  "turn": {
    "family": "mono",
    "fontSize": 20,
    "lineHeight": 28,
    "fontWeight": 500,
    "letterSpacing": 0
  },
  "code": {
    "family": "mono",
    "fontSize": 14,
    "lineHeight": 20,
    "fontWeight": 400,
    "letterSpacing": 0
  },
  "codeSm": {
    "family": "mono",
    "fontSize": 12,
    "lineHeight": 16,
    "fontWeight": 400,
    "letterSpacing": 0
  }
} as Record<string, TextStyleToken> as {
  display: TextStyleToken;
  h1: TextStyleToken;
  h2: TextStyleToken;
  h3: TextStyleToken;
  h4: TextStyleToken;
  body: TextStyleToken;
  bodyLong: TextStyleToken;
  label: TextStyleToken;
  caption: TextStyleToken;
  turnXl: TextStyleToken;
  turn: TextStyleToken;
  code: TextStyleToken;
  codeSm: TextStyleToken;
};
