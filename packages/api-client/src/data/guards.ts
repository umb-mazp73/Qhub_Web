/** Un payload de evento trae un turno si tiene al menos `id` y `numero`. */
export const isTicketStatusLike = (p: Record<string, unknown>): boolean => p.id != null && p.numero != null;
