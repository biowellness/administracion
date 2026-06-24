import { useEffect, useState } from 'react';
import { useMedplum } from '@medplum/react';
import type { MeasureReport, MeasureReportGroup } from '@medplum/fhirtypes';

export interface UseMeasureReportResult {
  /** El MeasureReport más reciente para el Measure canónico dado. */
  report: MeasureReport | undefined;
  loading: boolean;
  error: Error | undefined;
}

/**
 * Trae el MeasureReport más reciente de un Measure (por su canónico),
 * usando el patrón `?measure=<canónico>&_sort=-date&_count=1`.
 */
export function useMeasureReport(measureCanonical: string | undefined): UseMeasureReportResult {
  const medplum = useMedplum();
  const [report, setReport] = useState<MeasureReport>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error>();

  useEffect(() => {
    if (!measureCanonical) {
      setReport(undefined);
      setLoading(false);
      return;
    }
    let activo = true;
    setLoading(true);
    setError(undefined);
    medplum
      .searchResources('MeasureReport', { measure: measureCanonical, _sort: '-date', _count: '1' })
      .then((r) => {
        if (activo) {
          setReport(r[0]);
          setError(undefined);
        }
      })
      .catch((e: unknown) => {
        if (activo) {
          setError(e instanceof Error ? e : new Error(String(e)));
        }
      })
      .finally(() => {
        if (activo) {
          setLoading(false);
        }
      });
    return () => {
      activo = false;
    };
  }, [medplum, measureCanonical]);

  return { report, loading, error };
}

/** Valor (`measureScore.value`) del grupo cuyo `code.coding[0].code` coincide; 0 si no existe. */
export function groupValue(mr: MeasureReport | undefined, code: string): number {
  const g = mr?.group?.find((x) => x.code?.coding?.[0]?.code === code);
  return g?.measureScore?.value ?? 0;
}

/** Todos los grupos del MeasureReport (o `[]`). */
export function groups(mr: MeasureReport | undefined): MeasureReportGroup[] {
  return mr?.group ?? [];
}

/** Código del grupo (`code.coding[0].code`). */
export function groupCode(g: MeasureReportGroup): string | undefined {
  return g.code?.coding?.[0]?.code;
}

/** Etiqueta legible del grupo: display → text → code → '—'. */
export function groupLabel(g: MeasureReportGroup): string {
  return g.code?.coding?.[0]?.display ?? g.code?.text ?? g.code?.coding?.[0]?.code ?? '—';
}
