import type { Reference } from '@medplum/fhirtypes';

/** Id del recurso referenciado (p. ej. "Patient/abc" → "abc"); undefined si no aplica. */
export function idDeRef(ref?: Reference): string | undefined {
  const r = ref?.reference;
  return r && r.includes('/') ? r.split('/')[1] : undefined;
}
