/**
 * Parámetros del Tablero de Gestión (Anexo D · Punto 8) — la **superficie única de
 * configuración** que hoy está hardcodeada en los bots y pantallas. Andrés edita acá
 * (pantalla Parámetros) → una sola fuente para la app live, los bots y el template Excel.
 *
 * Vive en un recurso `Basic` **por período** (`identifier = SID_CONFIG_TABLERO|YYYY-MM`),
 * con los valores serializados como JSON en una extensión. Versionado por período porque
 * TC/aranceles/%s cambian mes a mes y el P&L histórico debe recalcular con lo vigente.
 *
 * El **TC no se duplica acá**: manda el Measure `tipo-cambio` (ver `useTipoCambio`); la
 * pantalla lo muestra como referencia de solo lectura.
 */
import { useEffect, useState } from 'react';
import { useMedplum } from '@medplum/react';
import type { Basic } from '@medplum/fhirtypes';
import type { MedplumClient } from '@medplum/core';
import {
  CONFIG_TABLERO_CODE,
  CS_CONFIG_TABLERO,
  SD_CONFIG_TABLERO_JSON,
  SID_CONFIG_TABLERO,
} from './systems';

/** Recurso físico medido (§4) con su capacidad. La utilización lo lee en Fase 3. */
export interface RecursoCapacidad {
  /** Id estable del recurso (no cambia aunque cambie el nombre). */
  codigo: string;
  nombre: string;
  /** Duración de una sesión, en minutos. slots/día = (horas × 60) ÷ duración. */
  duracionMin: number;
  /**
   * Regla R-07: Red Light + Recovery Pro Gab 1/2 comparten 2 tumbonas (capacidad acoplada).
   * Los recursos marcados forman un **pool** de capacidad, no se suman por separado.
   */
  comparteTumbona: boolean;
}

/** Participación de un socio en la distribución de resultados (0..100). */
export interface Participacion {
  nombre: string;
  pct: number;
}

/**
 * Parámetros editables del tablero, para un período `YYYY-MM`.
 *
 * Notas de la cascada (decisiones de Andrés, ver `docs/anexo-d/PLAN.md`):
 *  - **IV + TB:** de lo cobrado se descuenta Regenerar (`regenerarPct`) + la deducción fiscal
 *    común (`deduccion25Pct`); del neto, `honorariosIvtbPct` a médicos y el resto a BioWellness.
 *  - **Consultas:** de lo cobrado se descuenta `deduccion25Pct`; del neto, `consultasMedicosPct`
 *    a médicos y el resto a BioWellness (esa parte BW entra como línea de ingreso "Consultas").
 *  - El % BioWellness en ambas se **deriva** (100 − médicos): una sola fuente, sin descuadres.
 */
export interface ParametrosTablero {
  periodo: string;
  // — Operación / capacidad —
  diasOperativos: number;
  horasOperativas: number;
  // — Caja —
  saldoInicialCajaChica: number;
  saldoInicialEfectivo: number;
  // — Cascada IV + TB —
  /** % insumo Regenerar sobre lo cobrado de IV+TB (editable). */
  regenerarPct: number;
  /** % a médicos sobre el neto de IV+TB. BW = 100 − este. */
  honorariosIvtbPct: number;
  // — Cascada Consultas (solo médicas por ahora) —
  /** % a médicos sobre el neto de Consultas. BW = 100 − este. */
  consultasMedicosPct: number;
  // — Deducción fiscal común (impuestos + facturación + procesador de pago) —
  deduccion25Pct: number;
  // — Gastos / nómina —
  /** Cargas sociales sobre sueldos (gastos operativos). */
  cargasSocialesPct: number;
  /** Honorario fijo mensual del Dr. Conrado (ARS). */
  honorarioConrado: number;
  // — Umbrales de alerta —
  margenObjetivoPct: number;
  ocupacionAltaPct: number;
  // — Catálogos —
  recursos: RecursoCapacidad[];
  participaciones: Participacion[];
}

/** Los 13 recursos físicos (§4), con duraciones por defecto editables. */
const RECURSOS_DEFAULT: RecursoCapacidad[] = [
  { codigo: 'hbot-monoplaza', nombre: 'HBOT Monoplaza', duracionMin: 60, comparteTumbona: false },
  { codigo: 'hbot-biplaza', nombre: 'HBOT Biplaza', duracionMin: 60, comparteTumbona: false },
  { codigo: 'hbot-multiplaza', nombre: 'HBOT Multiplaza', duracionMin: 60, comparteTumbona: false },
  { codigo: 'ihht-1', nombre: 'IHHT 1', duracionMin: 45, comparteTumbona: false },
  { codigo: 'ihht-2', nombre: 'IHHT 2', duracionMin: 45, comparteTumbona: false },
  { codigo: 'recovery-pro-1', nombre: 'Recovery Pro Gab 1', duracionMin: 30, comparteTumbona: true },
  { codigo: 'recovery-pro-2', nombre: 'Recovery Pro Gab 2', duracionMin: 30, comparteTumbona: true },
  { codigo: 'red-light', nombre: 'Red Light', duracionMin: 20, comparteTumbona: true },
  { codigo: 'compresion', nombre: 'Compresión (IPC06)', duracionMin: 30, comparteTumbona: false },
  { codigo: 'crio', nombre: 'Crioterapia (COT03)', duracionMin: 15, comparteTumbona: false },
  { codigo: 'camilla-masajes', nombre: 'Camilla masajes', duracionMin: 60, comparteTumbona: false },
  { codigo: 'consultorio-medico', nombre: 'Consultorio médico', duracionMin: 30, comparteTumbona: false },
  { codigo: 'sala-tb-iv', nombre: 'Sala TB / IV', duracionMin: 60, comparteTumbona: false },
];

/** Participaciones confirmadas por Andrés (7 socios = 100%). */
const PARTICIPACIONES_DEFAULT: Participacion[] = [
  { nombre: 'Andrés Aizenberg', pct: 53 },
  { nombre: 'Diego Aizenberg', pct: 24 },
  { nombre: 'Daniel Tognetti', pct: 9 },
  { nombre: 'Evangelina Varela', pct: 6 },
  { nombre: 'Julián Massetti', pct: 5 },
  { nombre: 'Fernando Aldazábal', pct: 2 },
  { nombre: 'Diego Sívori', pct: 1 },
];

/** Devuelve los parámetros por defecto, sembrados del modelo, para un período. */
export function parametrosDefault(periodo: string): ParametrosTablero {
  return {
    periodo,
    diasOperativos: 25,
    horasOperativas: 12,
    saldoInicialCajaChica: 0,
    saldoInicialEfectivo: 0,
    regenerarPct: 30,
    honorariosIvtbPct: 15,
    consultasMedicosPct: 70,
    deduccion25Pct: 25,
    cargasSocialesPct: 27,
    honorarioConrado: 0,
    margenObjetivoPct: 20,
    ocupacionAltaPct: 85,
    recursos: RECURSOS_DEFAULT.map((r) => ({ ...r })),
    participaciones: PARTICIPACIONES_DEFAULT.map((p) => ({ ...p })),
  };
}

/** Período actual en formato `YYYY-MM`. */
export function periodoActual(): string {
  return new Date().toISOString().slice(0, 7);
}

/** Slots por día de un recurso = (horas × 60) ÷ duración (0 si la duración es inválida). */
export function slotsDia(recurso: RecursoCapacidad, p: ParametrosTablero): number {
  if (recurso.duracionMin <= 0) {
    return 0;
  }
  return Math.floor((p.horasOperativas * 60) / recurso.duracionMin);
}

/** Capacidad mensual de un recurso = slots/día × días operativos. */
export function capacidadMes(recurso: RecursoCapacidad, p: ParametrosTablero): number {
  return slotsDia(recurso, p) * p.diasOperativos;
}

/** Suma de participaciones (debe dar 100). */
export function sumaParticipaciones(p: ParametrosTablero): number {
  return p.participaciones.reduce((acc, x) => acc + (Number(x.pct) || 0), 0);
}

/** Completa cualquier campo faltante de un JSON parcial con los defaults del período. */
function conDefaults(parcial: Partial<ParametrosTablero>, periodo: string): ParametrosTablero {
  const base = parametrosDefault(periodo);
  return {
    ...base,
    ...parcial,
    periodo,
    recursos: parcial.recursos?.length ? parcial.recursos : base.recursos,
    participaciones: parcial.participaciones?.length ? parcial.participaciones : base.participaciones,
  };
}

/** Lee el JSON de parámetros de un Basic de config (o `undefined` si no tiene). */
function leerJson(basic: Basic | undefined, periodo: string): ParametrosTablero | undefined {
  const raw = basic?.extension?.find((e) => e.url === SD_CONFIG_TABLERO_JSON)?.valueString;
  if (!raw) {
    return undefined;
  }
  try {
    return conDefaults(JSON.parse(raw) as Partial<ParametrosTablero>, periodo);
  } catch {
    return undefined;
  }
}

export interface UseParametrosResult {
  params: ParametrosTablero;
  /** `true` mientras no hay config guardada (se muestran los defaults). */
  esDefault: boolean;
  loading: boolean;
  error: Error | undefined;
}

/**
 * Trae los parámetros del período (Basic `SID_CONFIG_TABLERO|periodo`); si no existen,
 * devuelve los defaults sembrados del modelo y `esDefault = true`.
 */
export function useParametros(periodo: string): UseParametrosResult {
  const medplum = useMedplum();
  const [params, setParams] = useState<ParametrosTablero>(() => parametrosDefault(periodo));
  const [esDefault, setEsDefault] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error>();

  useEffect(() => {
    let activo = true;
    setLoading(true);
    setError(undefined);
    setParams(parametrosDefault(periodo));
    setEsDefault(true);
    medplum
      .searchOne('Basic', { identifier: `${SID_CONFIG_TABLERO}|${periodo}` })
      .then((basic) => {
        if (!activo) {
          return;
        }
        const cargado = leerJson(basic, periodo);
        if (cargado) {
          setParams(cargado);
          setEsDefault(false);
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
  }, [medplum, periodo]);

  return { params, esDefault, loading, error };
}

/**
 * Crea/actualiza el Basic de config del período (upsert idempotente por identifier).
 * El template Excel y los bots leen este mismo recurso.
 */
export async function guardarParametros(medplum: MedplumClient, params: ParametrosTablero): Promise<Basic> {
  const basic: Basic = {
    resourceType: 'Basic',
    identifier: [{ system: SID_CONFIG_TABLERO, value: params.periodo }],
    code: { coding: [{ system: CS_CONFIG_TABLERO, code: CONFIG_TABLERO_CODE }] },
    extension: [{ url: SD_CONFIG_TABLERO_JSON, valueString: JSON.stringify(params) }],
  };
  return medplum.upsertResource(basic, { identifier: `${SID_CONFIG_TABLERO}|${params.periodo}` });
}
