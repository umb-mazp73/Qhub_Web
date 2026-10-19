export interface AuthRepositoryDeps { now?: () => Date }

/** `YYYY-MM-DD` con los campos locales del Date (el día que ve la persona). */
export const isoDate = (d: Date): string => `${String(d.getFullYear()).padStart(4, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
