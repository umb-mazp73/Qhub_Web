/** Sugerencias de prefijo de turno (`A`, `CA`…) a partir del nombre de la cola. Solo letras A–Z, 1 o 2. */

const STOPWORDS = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'al', 'y', 'e', 'en', 'para', 'por', 'a', 'un', 'una']);
const clean = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z\s]/g, ' ');
export const isValidQueuePrefix = (v: string): boolean => /^[A-Z]{1,2}$/.test(v);

/**
 * Hasta `max` prefijos libres, del más a menos natural: primera letra, iniciales de las dos primeras palabras,
 * las dos primeras letras, primera + segunda consonante, y por último letras sueltas que nadie use.
 * `taken` son los prefijos de las demás colas (no se repiten para que `A-023` no sea ambiguo).
 */
export function suggestQueuePrefixes(name: string, taken: readonly string[] = [], max = 4): string[] {
  const used = new Set(taken.map((t) => t.toUpperCase()));
  const words = clean(name).split(/\s+/).filter(Boolean);
  const significant = words.filter((w) => !STOPWORDS.has(w.toLowerCase()));
  const letters = words.join('');
  const consonants = letters.replace(/[AEIOU]/g, '');
  const candidates = [
    letters.slice(0, 1),
    (significant.length >= 2 ? significant[0]![0]! + significant[1]![0]! : ''),
    letters.slice(0, 2),
    consonants.slice(0, 2),
    (significant[0] ?? '').slice(0, 1) + (significant[0] ?? '').slice(2, 3),
    ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''),
  ];
  const out: string[] = [];
  for (const c of candidates) if (isValidQueuePrefix(c) && !used.has(c) && !out.includes(c)) { out.push(c); if (out.length === max) break; }
  return out;
}
