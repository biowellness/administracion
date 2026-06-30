/**
 * Inputs manuales del mes (Anexo D · Fase 1) — el "híbrido pragmático": el sistema llena
 * lo que sabe (ingresos cobrados, formas de pago) y Andrés carga acá lo que el sistema NO
 * puede saber (gastos manuales, Bar, caja chica). Espejo de las hojas de inputs del modelo
 * ('Gastos del Mes', 'Empleados', saldo de caja chica).
 *
 * Vive en un `Basic` por período (`identifier = SID_INPUTS_MES|YYYY-MM`), JSON en extensión.
 * El bot `kpis-finanzas` lo lee para armar `gastos-operativos`, `caja-chica` y `estado-resultados`.
 */
import { useEffect, useState } from 'react';
import { useMedplum } from '@medplum/react';
import type { Basic } from '@medplum/fhirtypes';
import type { MedplumClient } from '@medplum/core';
import {
  COMBOS,
  CS_INPUTS_MES,
  GASTO_KEYS_MANUALES,
  INPUTS_MES_CODE,
  PLANES_MEMBRESIA,
  SD_INPUTS_MES_JSON,
  SID_INPUTS_MES,
  type GastoKey,
} from './systems';

export interface InputsMes {
  periodo: string;
  /** Total de sueldos brutos del mes (el bot le suma cargas sociales desde Parámetros). */
  sueldosBrutos: number;
  /** Gastos manuales del mes, por clave (ver `GASTO_KEYS_MANUALES`). */
  gastos: Partial<Record<GastoKey, number>>;
  /** Resultado neto del Bar (unidad aparte, se carga a mano). */
  barNeto: number;
  /** Saldo de caja chica al arrancar el mes (si no, se toma de Parámetros). */
  cajaChicaSaldoInicial: number;
  /** Egresos de caja chica del mes (gastos menores en efectivo). */
  cajaChicaEgresos: number;
  /** Socios activos por plan (clave = código de `PLANES_MEMBRESIA`). */
  sociosPlan: Record<string, number>;
  /** Combos vendidos en el mes (clave = código de `COMBOS`). */
  combosVendidos: Record<string, number>;
}

/** Inputs vacíos para un período (todo en 0). */
export function inputsDefault(periodo: string): InputsMes {
  const gastos: Partial<Record<GastoKey, number>> = {};
  for (const k of GASTO_KEYS_MANUALES) {
    gastos[k] = 0;
  }
  const sociosPlan: Record<string, number> = {};
  for (const p of PLANES_MEMBRESIA) {
    sociosPlan[p.codigo] = 0;
  }
  const combosVendidos: Record<string, number> = {};
  for (const c of COMBOS) {
    combosVendidos[c.codigo] = 0;
  }
  return {
    periodo,
    sueldosBrutos: 0,
    gastos,
    barNeto: 0,
    cajaChicaSaldoInicial: 0,
    cajaChicaEgresos: 0,
    sociosPlan,
    combosVendidos,
  };
}

/** Completa un JSON parcial con los defaults del período. */
function conDefaults(parcial: Partial<InputsMes>, periodo: string): InputsMes {
  const base = inputsDefault(periodo);
  return {
    ...base,
    ...parcial,
    periodo,
    gastos: { ...base.gastos, ...(parcial.gastos ?? {}) },
    sociosPlan: { ...base.sociosPlan, ...(parcial.sociosPlan ?? {}) },
    combosVendidos: { ...base.combosVendidos, ...(parcial.combosVendidos ?? {}) },
  };
}

function leerJson(basic: Basic | undefined, periodo: string): InputsMes | undefined {
  const raw = basic?.extension?.find((e) => e.url === SD_INPUTS_MES_JSON)?.valueString;
  if (!raw) {
    return undefined;
  }
  try {
    return conDefaults(JSON.parse(raw) as Partial<InputsMes>, periodo);
  } catch {
    return undefined;
  }
}

export interface UseInputsMesResult {
  inputs: InputsMes;
  esDefault: boolean;
  loading: boolean;
  error: Error | undefined;
}

/** Trae los inputs manuales del período (o los defaults en 0 si no existen). */
export function useInputsMes(periodo: string): UseInputsMesResult {
  const medplum = useMedplum();
  const [inputs, setInputs] = useState<InputsMes>(() => inputsDefault(periodo));
  const [esDefault, setEsDefault] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error>();

  useEffect(() => {
    let activo = true;
    setLoading(true);
    setError(undefined);
    setInputs(inputsDefault(periodo));
    setEsDefault(true);
    medplum
      .searchOne('Basic', { identifier: `${SID_INPUTS_MES}|${periodo}` })
      .then((basic) => {
        if (!activo) {
          return;
        }
        const cargado = leerJson(basic, periodo);
        if (cargado) {
          setInputs(cargado);
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

  return { inputs, esDefault, loading, error };
}

/** Crea/actualiza el Basic de inputs del período (upsert idempotente por identifier). */
export async function guardarInputsMes(medplum: MedplumClient, inputs: InputsMes): Promise<Basic> {
  const basic: Basic = {
    resourceType: 'Basic',
    identifier: [{ system: SID_INPUTS_MES, value: inputs.periodo }],
    code: { coding: [{ system: CS_INPUTS_MES, code: INPUTS_MES_CODE }] },
    extension: [{ url: SD_INPUTS_MES_JSON, valueString: JSON.stringify(inputs) }],
  };
  return medplum.upsertResource(basic, { identifier: `${SID_INPUTS_MES}|${inputs.periodo}` });
}
