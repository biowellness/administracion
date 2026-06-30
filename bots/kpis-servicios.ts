import { BotEvent, MedplumClient } from '@medplum/core';
import { Appointment, MeasureReport, MeasureReportGroup } from '@medplum/fhirtypes';

/**
 * Bot `kpis-servicios` — utilización por recurso (Anexo D · Fase 3). Cuenta las sesiones
 * realizadas por recurso físico y las divide por la capacidad (de la config FHIR del mes)
 * para publicar el MeasureReport `utilizacion-recurso` que leen la pantalla Día, el Dashboard
 * y el narrador.
 *
 * Aplica la **regla R-07** (Red Light + Recovery Pro Gab 1/2 comparten 2 tumbonas) como
 * **pool de capacidad en minutos**: el cuello de botella real es `2 × horas × 60` min/día,
 * no la suma de capacidades individuales.
 *
 * ⚠️ SUPUESTOS (ajustar al modelo operativo de recepcionistas):
 *  - una sesión = un `Appointment` con `status='fulfilled'` en el período;
 *  - el recurso sale de la extensión `item-codigo` (código/nombre) o de `serviceType`;
 *  - la capacidad (días, horas, duración por recurso) vive en `config-tablero` (Parámetros).
 */

const SID = 'https://bio.medplum.com.ar/fhir/sid/measurereport';
const MEASURE_BW = 'https://biowellness.ar/fhir/Measure';
const SID_CONFIG = 'https://bio.medplum.com.ar/fhir/sid/config-tablero';
const SD_CONFIG_JSON = 'https://bio.medplum.com.ar/fhir/StructureDefinition/config-tablero-json';
const SD_ITEM_CODIGO = 'https://biowellness.ar/fhir/StructureDefinition/item-codigo';
const TUMBONAS_RED_LIGHT = 2;

interface RecursoCfg {
  codigo: string;
  nombre: string;
  duracionMin: number;
  comparteTumbona: boolean;
}
interface ConfigTablero {
  diasOperativos: number;
  horasOperativas: number;
  recursos: RecursoCfg[];
}

/** Fallback (espejo de `parametros.ts`) si no hay config del período. */
const RECURSOS_DEFAULT: RecursoCfg[] = [
  { codigo: 'hbot-monoplaza', nombre: 'HBOT Monoplaza', duracionMin: 60, comparteTumbona: false },
  { codigo: 'hbot-biplaza', nombre: 'HBOT Biplaza', duracionMin: 60, comparteTumbona: false },
  { codigo: 'hbot-multiplaza', nombre: 'HBOT Multiplaza', duracionMin: 60, comparteTumbona: false },
  { codigo: 'ihht-1', nombre: 'IHHT 1', duracionMin: 30, comparteTumbona: false },
  { codigo: 'ihht-2', nombre: 'IHHT 2', duracionMin: 30, comparteTumbona: false },
  { codigo: 'recovery-pro-1', nombre: 'Recovery Pro Gab 1', duracionMin: 60, comparteTumbona: true },
  { codigo: 'recovery-pro-2', nombre: 'Recovery Pro Gab 2', duracionMin: 60, comparteTumbona: true },
  { codigo: 'red-light', nombre: 'Red Light', duracionMin: 30, comparteTumbona: true },
  { codigo: 'compresion', nombre: 'Compresión (IPC06)', duracionMin: 30, comparteTumbona: false },
  { codigo: 'crio', nombre: 'Crio (COT03)', duracionMin: 30, comparteTumbona: false },
  { codigo: 'camilla-masajes', nombre: 'Camilla masajes', duracionMin: 60, comparteTumbona: false },
  { codigo: 'consultorio-medico', nombre: 'Consultorio médico', duracionMin: 60, comparteTumbona: false },
  { codigo: 'sala-tb-iv', nombre: 'Sala TB / IV', duracionMin: 60, comparteTumbona: false },
];

interface ServiciosInput {
  periodo?: string; // YYYY-MM
}

interface Periodo {
  ym: string;
  start: string;
  end: string;
}

function calcularPeriodo(ym?: string): Periodo {
  const ref = ym ? new Date(`${ym}-01T00:00:00Z`) : new Date();
  const y = ref.getUTCFullYear();
  const m = ref.getUTCMonth();
  const iso = (d: Date): string => d.toISOString().slice(0, 10);
  return {
    ym: `${y}-${String(m + 1).padStart(2, '0')}`,
    start: iso(new Date(Date.UTC(y, m, 1))),
    end: iso(new Date(Date.UTC(y, m + 1, 0))),
  };
}

async function leerConfig(medplum: MedplumClient, periodo: string): Promise<ConfigTablero> {
  const def: ConfigTablero = { diasOperativos: 25, horasOperativas: 12, recursos: RECURSOS_DEFAULT };
  const basic = await medplum.searchOne('Basic', `identifier=${SID_CONFIG}|${periodo}`);
  const raw = basic?.extension?.find((e) => e.url === SD_CONFIG_JSON)?.valueString;
  if (!raw) {
    return def;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<ConfigTablero>;
    return {
      diasOperativos: parsed.diasOperativos ?? def.diasOperativos,
      horasOperativas: parsed.horasOperativas ?? def.horasOperativas,
      recursos: parsed.recursos?.length ? parsed.recursos : RECURSOS_DEFAULT,
    };
  } catch {
    return def;
  }
}

/** Recurso de un Appointment: extensión item-codigo (código o nombre) o serviceType. */
function recursoDe(appt: Appointment, recursos: RecursoCfg[]): string | undefined {
  const ext = appt.extension?.find((e) => e.url === SD_ITEM_CODIGO)?.valueString;
  const st = appt.serviceType?.[0]?.text ?? appt.serviceType?.[0]?.coding?.[0]?.display;
  const candidatos = [ext, st].filter(Boolean) as string[];
  for (const c of candidatos) {
    const r = recursos.find((x) => x.codigo === c || x.nombre === c);
    if (r) {
      return r.codigo;
    }
  }
  return undefined;
}

const slotsDia = (duracionMin: number, horas: number): number => (duracionMin > 0 ? Math.floor((horas * 60) / duracionMin) : 0);

function buildMR(slug: string, p: Periodo, grupos: MeasureReportGroup[]): MeasureReport {
  return {
    resourceType: 'MeasureReport',
    status: 'complete',
    type: 'summary',
    measure: `${MEASURE_BW}/${slug}`,
    date: new Date().toISOString().slice(0, 10),
    period: { start: p.start, end: p.end },
    identifier: [{ system: SID, value: `${slug}-${p.ym}` }],
    group: grupos,
  };
}

async function upsert(medplum: MedplumClient, mr: MeasureReport): Promise<void> {
  const idv = mr.identifier?.[0]?.value;
  const existing = await medplum.searchOne('MeasureReport', `identifier=${SID}|${idv}`);
  if (existing) {
    await medplum.updateResource({ ...mr, id: existing.id });
  } else {
    await medplum.createResource(mr);
  }
}

export async function handler(
  medplum: MedplumClient,
  event: BotEvent<ServiciosInput>
): Promise<{ periodo: string; sesiones: number }> {
  const p = calcularPeriodo(event.input?.periodo);
  const cfg = await leerConfig(medplum, p.ym);

  const appts = await medplum.searchResources('Appointment', `date=ge${p.start}&date=le${p.end}&_count=1000`);
  const sesiones = new Map<string, number>();
  for (const a of appts) {
    if (a.status !== 'fulfilled') {
      continue;
    }
    const r = recursoDe(a, cfg.recursos);
    if (r) {
      sesiones.set(r, (sesiones.get(r) ?? 0) + 1);
    }
  }

  const grupo = (r: RecursoCfg): MeasureReportGroup => {
    const n = sesiones.get(r.codigo) ?? 0;
    const cap = slotsDia(r.duracionMin, cfg.horasOperativas) * cfg.diasOperativos;
    const util = cap > 0 ? n / cap : 0;
    return {
      code: { coding: [{ code: r.codigo, display: r.nombre }] },
      measureScore: { value: util },
      population: [
        { code: { coding: [{ code: 'sesiones' }] }, count: n },
        { code: { coding: [{ code: 'capacidad' }] }, count: cap },
      ],
    };
  };

  const grupos = cfg.recursos.map(grupo);
  const totalSesiones = [...sesiones.values()].reduce((s, n) => s + n, 0);
  const totalCap = cfg.recursos.reduce((s, r) => s + slotsDia(r.duracionMin, cfg.horasOperativas) * cfg.diasOperativos, 0);

  // R-07: pool de capacidad en minutos (2 tumbonas × horas × 60 × días).
  const pooled = cfg.recursos.filter((r) => r.comparteTumbona);
  const poolUsadoMin = pooled.reduce((s, r) => s + (sesiones.get(r.codigo) ?? 0) * r.duracionMin, 0);
  const poolCapMin = TUMBONAS_RED_LIGHT * cfg.horasOperativas * 60 * cfg.diasOperativos;
  const poolUtil = poolCapMin > 0 ? poolUsadoMin / poolCapMin : 0;

  const reporte = buildMR('utilizacion-recurso', p, [
    ...grupos,
    {
      code: { coding: [{ code: 'pool-red-light', display: 'Pool Red Light (R-07)' }] },
      measureScore: { value: poolUtil },
      population: [
        { code: { coding: [{ code: 'usado-min' }] }, count: poolUsadoMin },
        { code: { coding: [{ code: 'capacidad-min' }] }, count: poolCapMin },
      ],
    },
    {
      code: { coding: [{ code: 'global', display: 'Utilización global' }] },
      measureScore: { value: totalCap > 0 ? totalSesiones / totalCap : 0 },
      population: [{ code: { coding: [{ code: 'sesiones' }] }, count: totalSesiones }],
    },
  ]);

  await upsert(medplum, reporte);
  return { periodo: p.ym, sesiones: totalSesiones };
}
