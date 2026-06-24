/** Formatea un número como entero con separadores es-AR (p. ej. 1234 → "1.234"). */
export function fmt(n: number): string {
  return new Intl.NumberFormat('es-AR').format(Math.round(n));
}

/** Formatea con 2 decimales es-AR (p. ej. 1490.5 → "1.490,50"). Útil para el TC. */
export function fmt2(n: number): string {
  return new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}
