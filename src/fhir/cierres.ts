/**
 * Cierre de mes y consolidado anual (Anexo D · Fase 4). "Cerrar mes" toma un **snapshot
 * inmutable** de los totales del mes (de los Measures del estado de resultados) y lo guarda
 * en un `Basic` por período (`cierre-mes|YYYY-MM`). El consolidado anual lee los 12 cierres
 * del año y arma la evolución, el mejor mes, el mix y la distribución por socio — replicando
 * el modelo `tablero-anual`.
 */
import { useCallback, useEffect, useState } from 'react';
import { useMedplum } from '@medplum/react';
import type { Basic, MeasureReport } from '@medplum/fhirtypes';
import type { MedplumClient } from '@medplum/core';
import { groupCode, groups, groupValue } from '../hooks/useMeasureReport';
import {
  CIERRE_MES_CODE,
  CS_CIERRE_MES,
  SD_CIERRE_MES_JSON,
  SID_CIERRE_MES,
} from './systems';
import type { Participacion } from './parametros';

export interface MontoCodificado {
  codigo: string;
  label: string;
  monto: number;
}

export interface CierreMes {
  periodo: string; // YYYY-MM
  ingresosWellness: number;
  lineas: MontoCodificado[];
  gastosOperativos: number;
  cajaChicaEgresos: number;
  barNeto: number;
  resultadoTotal: number;
  margen: number; // fracción
  mrrUsd: number;
  socios: number;
  formasPago: MontoCodificado[];
  /** Fecha del cierre (YYYY-MM-DD). */
  cerradoEn: string;
}

const MESES_CORTO = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

/** Etiqueta corta del mes (1-12). */
export function mesLabel(m: number): string {
  return MESES_CORTO[m - 1] ?? String(m);
}

/** Columna del modelo anual para el mes (1=C … 12=N). */
export function mesColumna(m: number): string {
  return String.fromCharCode('C'.charCodeAt(0) + (m - 1));
}

const codificados = (report: MeasureReport | undefined): MontoCodificado[] =>
  groups(report)
    .filter((g) => groupCode(g) !== 'global')
    .map((g) => ({
      codigo: groupCode(g) ?? '',
      label: g.code?.coding?.[0]?.display ?? groupCode(g) ?? '',
      monto: g.measureScore?.value ?? 0,
    }));

export interface MeasuresCierre {
  estado?: MeasureReport;
  linea?: MeasureReport;
  cobro?: MeasureReport;
  mrr?: MeasureReport;
}

/** Construye el snapshot del mes a partir de los Measures vigentes. */
export function construirCierre(periodo: string, m: MeasuresCierre, hoy: string): CierreMes {
  return {
    periodo,
    ingresosWellness: groupValue(m.estado, 'ingresos-wellness'),
    lineas: codificados(m.linea),
    gastosOperativos: groupValue(m.estado, 'gastos-operativos'),
    cajaChicaEgresos: groupValue(m.estado, 'caja-chica-egresos'),
    barNeto: groupValue(m.estado, 'bar-neto'),
    resultadoTotal: groupValue(m.estado, 'resultado-total'),
    margen: groupValue(m.estado, 'margen-operativo'),
    mrrUsd: groupValue(m.mrr, 'global'),
    socios: groupValue(m.mrr, 'socios'),
    formasPago: codificados(m.cobro),
    cerradoEn: hoy,
  };
}

/** Crea/actualiza el Basic de cierre del período (upsert idempotente por identifier). */
export async function cerrarMes(medplum: MedplumClient, cierre: CierreMes): Promise<Basic> {
  const basic: Basic = {
    resourceType: 'Basic',
    identifier: [{ system: SID_CIERRE_MES, value: cierre.periodo }],
    code: { coding: [{ system: CS_CIERRE_MES, code: CIERRE_MES_CODE }] },
    extension: [{ url: SD_CIERRE_MES_JSON, valueString: JSON.stringify(cierre) }],
  };
  return medplum.upsertResource(basic, { identifier: `${SID_CIERRE_MES}|${cierre.periodo}` });
}

function leerCierre(basic: Basic): CierreMes | undefined {
  const raw = basic.extension?.find((e) => e.url === SD_CIERRE_MES_JSON)?.valueString;
  if (!raw) {
    return undefined;
  }
  try {
    return JSON.parse(raw) as CierreMes;
  } catch {
    return undefined;
  }
}

export interface UseCierresResult {
  cierres: CierreMes[];
  loading: boolean;
  error: Error | undefined;
  recargar: () => void;
}

/** Trae todos los cierres del año (`YYYY`), ordenados por período. */
export function useCierresAnio(anio: string): UseCierresResult {
  const medplum = useMedplum();
  const [cierres, setCierres] = useState<CierreMes[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error>();

  const cargar = useCallback(() => {
    let activo = true;
    setLoading(true);
    setError(undefined);
    medplum
      .searchResources('Basic', { code: `${CS_CIERRE_MES}|${CIERRE_MES_CODE}`, _count: '100' })
      .then((recursos) => {
        if (!activo) {
          return;
        }
        const todos = recursos.map(leerCierre).filter((c): c is CierreMes => !!c);
        setCierres(todos.filter((c) => c.periodo.startsWith(`${anio}-`)).sort((a, b) => a.periodo.localeCompare(b.periodo)));
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
  }, [medplum, anio]);

  useEffect(() => cargar(), [cargar]);

  return { cierres, loading, error, recargar: cargar };
}

export interface MesConsolidado {
  mes: number;
  label: string;
  cierre?: CierreMes;
  ingresos: number;
  ebitda: number;
  resultado: number;
  margen: number;
}

export interface ConsolidadoAnual {
  anio: string;
  meses: MesConsolidado[];
  ingresosAnio: number;
  ebitdaAnio: number;
  resultadoAnio: number;
  margenAnio: number;
  mejorMes?: MesConsolidado;
  mixAnual: MontoCodificado[];
  formasPagoAnual: MontoCodificado[];
  distribucion: { nombre: string; pct: number; monto: number }[];
  mesesCerrados: number;
}

function acumular(destino: Map<string, MontoCodificado>, items: MontoCodificado[]): void {
  for (const it of items) {
    const prev = destino.get(it.codigo);
    if (prev) {
      prev.monto += it.monto;
    } else {
      destino.set(it.codigo, { ...it });
    }
  }
}

/** Arma el consolidado anual a partir de los cierres y las participaciones vigentes. */
export function consolidarAnio(anio: string, cierres: CierreMes[], participaciones: Participacion[]): ConsolidadoAnual {
  const porMes = new Map<number, CierreMes>();
  for (const c of cierres) {
    porMes.set(Number(c.periodo.slice(5, 7)), c);
  }

  const mixMap = new Map<string, MontoCodificado>();
  const fpMap = new Map<string, MontoCodificado>();
  const meses: MesConsolidado[] = [];
  for (let m = 1; m <= 12; m++) {
    const c = porMes.get(m);
    const ingresos = c?.ingresosWellness ?? 0;
    const ebitda = c ? c.ingresosWellness - c.gastosOperativos - c.cajaChicaEgresos : 0;
    const resultado = c?.resultadoTotal ?? 0;
    meses.push({ mes: m, label: mesLabel(m), cierre: c, ingresos, ebitda, resultado, margen: ingresos > 0 ? ebitda / ingresos : 0 });
    if (c) {
      acumular(mixMap, c.lineas);
      acumular(fpMap, c.formasPago);
    }
  }

  const ingresosAnio = meses.reduce((s, x) => s + x.ingresos, 0);
  const ebitdaAnio = meses.reduce((s, x) => s + x.ebitda, 0);
  const resultadoAnio = meses.reduce((s, x) => s + x.resultado, 0);
  const cerrados = meses.filter((x) => x.cierre);
  const mejorMes = cerrados.length ? cerrados.reduce((a, b) => (b.resultado > a.resultado ? b : a)) : undefined;

  return {
    anio,
    meses,
    ingresosAnio,
    ebitdaAnio,
    resultadoAnio,
    margenAnio: ingresosAnio > 0 ? ebitdaAnio / ingresosAnio : 0,
    mejorMes,
    mixAnual: [...mixMap.values()].sort((a, b) => b.monto - a.monto),
    formasPagoAnual: [...fpMap.values()].sort((a, b) => b.monto - a.monto),
    distribucion: participaciones.map((p) => ({
      nombre: p.nombre,
      pct: p.pct,
      monto: Math.round((resultadoAnio * (Number(p.pct) || 0)) / 100),
    })),
    mesesCerrados: cerrados.length,
  };
}
