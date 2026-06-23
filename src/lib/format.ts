/** Formatea un número como entero con separadores es-AR (p. ej. 1234 → "1.234"). */
export function fmt(n: number): string {
  return new Intl.NumberFormat('es-AR').format(Math.round(n));
}
