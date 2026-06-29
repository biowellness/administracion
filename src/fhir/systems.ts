/**
 * Fuente única de verdad para TODAS las URLs canónicas y `system` de FHIR que usa
 * la app de administración. Centralizar acá es clave porque hay DOS namespaces en el
 * sistema (ver sección 5 del brief) y está planificada una unificación a `biowellness.ar`:
 * cuando se haga, este debería ser el único archivo a tocar en esta app.
 *
 *  - `https://biowellness.ar/fhir/...`        → operativo (`recepcionistas`) + `kpis-servicios`
 *  - `https://bio.medplum.com.ar/fhir/...`    → CRM + catálogo clínico
 *
 * No inventar un tercer namespace.
 */

/** Namespaces base. */
export const NS = {
  /** CRM (embudo, leads, segmentos, campañas, retención) + catálogo clínico. */
  bio: 'https://bio.medplum.com.ar/fhir',
  /** Operativo (agenda, servicios, membresías) + `kpis-servicios`. */
  bw: 'https://biowellness.ar/fhir',
} as const;

// ---------------------------------------------------------------------------
// KPIs y embudo — MeasureReport de `kpis-crm`  (namespace bio)
// ---------------------------------------------------------------------------

/** Base canónica de los Measure del CRM: `${MEASURE_CRM}/<slug>`. */
export const MEASURE_CRM = `${NS.bio}/Measure`;

/**
 * Slugs de Measure que produce `kpis-crm`.
 * `ltv-segmento` es un slug ASUMIDO para LTV por segmento (tarea futura): la app lo lee
 * con grupos por segmento; confirmar con el bot cuando exista.
 */
export const MEASURE_SLUGS_CRM = ['embudo', 'clientes', 'conversion', 'churn', 'ltv-promedio', 'ltv-segmento'] as const;
export type MeasureSlugCrm = (typeof MEASURE_SLUGS_CRM)[number];

/** Canónico de un Measure del CRM para usar en `MeasureReport?measure=...`. */
export function measureCrm(slug: MeasureSlugCrm): string {
  return `${MEASURE_CRM}/${slug}`;
}

/** `identifier.system` de los MeasureReport (value = `<slug>-<YYYY-MM>`). */
export const SID_MEASUREREPORT = `${NS.bio}/sid/measurereport`;

/** Códigos de grupo (`group[].code.coding[0].code`) por Measure del CRM. */
export const GRUPOS_CRM = {
  embudo: ['nuevo', 'contactado', 'evaluacion-agendada', 'convertido'],
  clientes: ['lead', 'activo'],
  conversion: ['tasa'],
  churn: ['alto'],
  'ltv-promedio': ['promedio'],
} as const;

// ---------------------------------------------------------------------------
// Servicios — MeasureReport de `kpis-servicios`  (namespace bw)
// ---------------------------------------------------------------------------

/** Base canónica de los Measure de servicios: `${MEASURE_SERVICIOS}/<slug>`. */
export const MEASURE_SERVICIOS = `${NS.bw}/Measure`;

/** Slugs de Measure que produce `kpis-servicios`. */
export const MEASURE_SLUGS_SERVICIOS = ['servicios-turnos', 'agenda-ocupacion', 'membresias-utilizacion'] as const;
export type MeasureSlugServicios = (typeof MEASURE_SLUGS_SERVICIOS)[number];

/** Canónico de un Measure de servicios para usar en `MeasureReport?measure=...`. */
export function measureServicios(slug: MeasureSlugServicios): string {
  return `${MEASURE_SERVICIOS}/${slug}`;
}

// ---------------------------------------------------------------------------
// Reportes financieros y de gestión — MeasureReport (kpis-finanzas / kpis-gestion)
// SLUGS ASUMIDOS (sección 6.8): confirmar con los bots cuando existan.
// ---------------------------------------------------------------------------

/** Slugs (asumidos) de Measure de finanzas/gestión, en el namespace CRM (bio). */
export const MEASURE_SLUGS_FINANZAS = [
  'ingresos',
  'ingresos-linea',
  'ingresos-servicio',
  'ingresos-medico',
  'ingresos-cobro',
  'ingresos-iv-tb',
  'cobros',
  'gastos-operativos',
  'estado-resultados',
  'caja-chica',
  'consultas-split',
  'membresias-mrr',
  'founding-members',
  'margen',
  'tipo-cambio',
] as const;
export type MeasureSlugFinanzas = (typeof MEASURE_SLUGS_FINANZAS)[number];

/** Canónico de un Measure de finanzas/gestión (namespace bio). */
export function measureFinanzas(slug: MeasureSlugFinanzas): string {
  return `${MEASURE_CRM}/${slug}`;
}

// ---------------------------------------------------------------------------
// Clínicos agregados (kpis-clinico) — SOLO señales agregadas, sin valores clínicos
// (respeta la AccessPolicy). SLUGS ASUMIDOS (sección 6.8 · Fase 4).
// ---------------------------------------------------------------------------

export const MEASURE_SLUGS_CLINICO = ['sin-visita', 'baja-utilizacion', 'consentimientos'] as const;
export type MeasureSlugClinico = (typeof MEASURE_SLUGS_CLINICO)[number];

/** Canónico de un Measure clínico agregado (prefijo `clinico-`, namespace bio). */
export function measureClinico(slug: MeasureSlugClinico): string {
  return `${MEASURE_CRM}/clinico-${slug}`;
}

/** Measure de gestión: proyección del modelo v12 vs. real. ASUMIDO. */
export const MEASURE_PROYECCION = `${MEASURE_CRM}/proyeccion-v12`;

// ---------------------------------------------------------------------------
// Config del Tablero de Gestión (Anexo D) — recurso Basic por período (Fase 0)
// ---------------------------------------------------------------------------

/** `identifier.system` del Basic de config (value = período `YYYY-MM`). */
export const SID_CONFIG_TABLERO = `${NS.bio}/sid/config-tablero`;
/** `code.system` del Basic de config. */
export const CS_CONFIG_TABLERO = `${NS.bio}/CodeSystem/config-tablero`;
export const CONFIG_TABLERO_CODE = 'tablero-config';
/** Extensión que guarda los parámetros como JSON. */
export const SD_CONFIG_TABLERO_JSON = `${NS.bio}/StructureDefinition/config-tablero-json`;

// ---------------------------------------------------------------------------
// Línea comercial (Anexo D · Fase 0) — corte de ingresos por línea de negocio.
// Es la marca que desbloquea el estado de resultados (≠ servicio físico).
// ---------------------------------------------------------------------------

/** Extensión `valueCode` en ChargeItem con la línea comercial del cobro. */
export const SD_LINEA_COMERCIAL = `${NS.bio}/StructureDefinition/linea-comercial`;

/** Líneas comerciales del estado de resultados (códigos de grupo de `ingresos-linea`). */
export const LINEAS_COMERCIALES = ['membresias', 'sueltas-combos', 'paquetes', 'iv-tb', 'consultas', 'otros'] as const;
export type LineaComercial = (typeof LINEAS_COMERCIALES)[number];

export const LINEA_COMERCIAL_LABEL: Record<LineaComercial, string> = {
  membresias: 'Membresías',
  'sueltas-combos': 'Sueltas y combos',
  paquetes: 'Paquetes',
  'iv-tb': 'IV + Terapias Biológicas',
  consultas: 'Consultas',
  otros: 'Otros',
};

/** Líneas de ingreso del estado de resultados (orden del modelo, sin "consultas"). */
export const LINEAS_PYL = ['membresias', 'sueltas-combos', 'paquetes', 'iv-tb', 'otros'] as const;

// ---------------------------------------------------------------------------
// Inputs manuales del mes (Anexo D · Fase 1) — lo que el sistema NO puede saber
// (gastos manuales, Bar, caja chica). Recurso Basic por período, espejo de las
// hojas de inputs del modelo ('Gastos del Mes', 'Empleados').
// ---------------------------------------------------------------------------

/** `identifier.system` del Basic de inputs (value = período `YYYY-MM`). */
export const SID_INPUTS_MES = `${NS.bio}/sid/inputs-mes`;
export const CS_INPUTS_MES = `${NS.bio}/CodeSystem/inputs-mes`;
export const INPUTS_MES_CODE = 'inputs-mes';
export const SD_INPUTS_MES_JSON = `${NS.bio}/StructureDefinition/inputs-mes-json`;

/**
 * Las 17 líneas de gastos operativos del mes (espejo de 'Gastos del Mes' del modelo).
 *  - `auto`   → lo calcula el bot (honorarios 15%·IV+TB, Regenerar 30%·IV+TB).
 *  - `config` → viene de Parámetros (honorario Dr. Conrado).
 *  - `sueldos`→ sueldos brutos · (1 + cargas sociales) — input manual especial.
 *  - `manual` → input directo del mes (InputsMes.gastos[key]).
 */
export const GASTO_LINEAS = [
  { key: 'sueldos', label: 'Sueldos + cargas sociales', tipo: 'sueldos' },
  { key: 'honorario-conrado', label: 'Honorario Dr. Conrado', tipo: 'config' },
  { key: 'honorarios-medicos', label: 'Honorarios médicos (IV+TB)', tipo: 'auto' },
  { key: 'insumos-regenerar', label: 'Insumos Regenerar (IV+TB)', tipo: 'auto' },
  { key: 'alquiler', label: 'Alquiler local', tipo: 'manual' },
  { key: 'estacionamiento', label: 'Estacionamiento', tipo: 'manual' },
  { key: 'electricidad-gas', label: 'Electricidad / Gas', tipo: 'manual' },
  { key: 'internet-software', label: 'Internet / Software', tipo: 'manual' },
  { key: 'seguros', label: 'Seguros', tipo: 'manual' },
  { key: 'mantenimiento', label: 'Mantenimiento', tipo: 'manual' },
  { key: 'marketing', label: 'Marketing', tipo: 'manual' },
  { key: 'insumos-medicos', label: 'Insumos médicos (stock)', tipo: 'manual' },
  { key: 'contaduria-legal', label: 'Contaduría / Legal', tipo: 'manual' },
  { key: 'comisiones-mp', label: 'Comisiones MercadoPago / POS', tipo: 'manual' },
  { key: 'iibb', label: 'IIBB', tipo: 'manual' },
  { key: 'lavanderia', label: 'Lavandería', tipo: 'manual' },
  { key: 'gastos-varios', label: 'Gastos varios', tipo: 'manual' },
] as const;
export type GastoLinea = (typeof GASTO_LINEAS)[number];
export type GastoKey = GastoLinea['key'];

/** Las claves de gastos que el usuario carga a mano (InputsMes.gastos). */
export const GASTO_KEYS_MANUALES = GASTO_LINEAS.filter((g) => g.tipo === 'manual').map((g) => g.key);

/** Códigos de grupo del Measure `estado-resultados` (orden del P&L). */
export const PYL_CODES = [
  'ingresos-wellness',
  'gastos-operativos',
  'caja-chica-egresos',
  'ebitda',
  'bar-neto',
  'resultado-total',
  'margen-operativo',
  'margen-objetivo',
] as const;

// ---------------------------------------------------------------------------
// Pipeline (kanban) — Task  (namespace bio)
// ---------------------------------------------------------------------------

/** `Task.businessStatus.coding.system` con la etapa del pipeline. */
export const CS_ETAPA_PIPELINE = `${NS.bio}/CodeSystem/etapa-pipeline`;

/** Etapas del pipeline comercial (códigos). */
export const ETAPAS_PIPELINE = ['nuevo', 'contactado', 'evaluacion-agendada', 'convertido', 'perdido'] as const;
export type EtapaPipeline = (typeof ETAPAS_PIPELINE)[number];

export const ETAPA_PIPELINE_LABEL: Record<EtapaPipeline, string> = {
  nuevo: 'Nuevo',
  contactado: 'Contactado',
  'evaluacion-agendada': 'Evaluación agendada',
  convertido: 'Convertido',
  perdido: 'Perdido',
};

/** `Task.input[].type.text` que guarda la próxima acción del pipeline. */
export const TASK_INPUT_PROXIMA_ACCION = 'próxima-acción';

// ---------------------------------------------------------------------------
// Leads y atribución — Patient + Provenance  (namespace bio)
// ---------------------------------------------------------------------------

/** Extensión de ciclo de vida del cliente en Patient (`lead` / `activo`). */
export const SD_CICLO_VIDA = `${NS.bio}/StructureDefinition/ciclo-vida-cliente`;
/** `meta.tag.system` espejo del ciclo de vida. */
export const CS_CICLO_VIDA = `${NS.bio}/CodeSystem/ciclo-vida-cliente`;
export const CICLO_VIDA = ['lead', 'activo'] as const;
export type CicloVida = (typeof CICLO_VIDA)[number];

/** Extensión de atribución en el Provenance del lead (sub-ext: fuente, utm_source, campania, referido-por). */
export const SD_LEAD_ORIGEN = `${NS.bio}/StructureDefinition/lead-origen`;

// ---------------------------------------------------------------------------
// Segmentos — Group  (namespace bio)
// ---------------------------------------------------------------------------

/** `identifier.system` de los Group de segmentación. */
export const SID_SEGMENTO = `${NS.bio}/sid/segmento`;
/** `identifier.system` de Group ad-hoc creados por la app (p. ej. recuperación). */
export const SID_GRUPO_ADHOC = `${NS.bio}/sid/grupo-adhoc`;
/** Discriminador de criterio en `Group.characteristic[]`. */
export const CS_RASGO_SEGMENTO = `${NS.bio}/CodeSystem/rasgo-segmento`;
export const RASGOS_SEGMENTO = ['perfil-interes', 'ciclo-vida', 'biomarcador', 'gate-terapia'] as const;
export type RasgoSegmento = (typeof RASGOS_SEGMENTO)[number];

export const RASGO_SEGMENTO_LABEL: Record<RasgoSegmento, string> = {
  'perfil-interes': 'Perfil de interés',
  'ciclo-vida': 'Ciclo de vida',
  biomarcador: 'Biomarcador',
  'gate-terapia': 'Gate de terapia',
};

// ---------------------------------------------------------------------------
// Campañas — Communication  (namespace bio)
// ---------------------------------------------------------------------------

/** `identifier.system` de campaña (value = id de campaña). */
export const SID_CAMPANIA = `${NS.bio}/sid/campania`;

// ---------------------------------------------------------------------------
// Retención — Flag + Task  (namespace bio)
// ---------------------------------------------------------------------------

/** `Flag.category.coding.system`; el code de churn es `churn-risk`. */
export const CS_CATEGORIA_FLAG = `${NS.bio}/CodeSystem/categoria-flag`;
export const FLAG_CHURN_RISK = 'churn-risk';

/** `Flag.code.coding.system` con el nivel de riesgo de churn. */
export const CS_RIESGO_CHURN = `${NS.bio}/CodeSystem/riesgo-churn`;
export const RIESGO_CHURN_NIVELES = ['bajo', 'medio', 'alto'] as const;
export type RiesgoChurn = (typeof RIESGO_CHURN_NIVELES)[number];

/** Code de la Task de recuperación: `${CS_RIESGO_CHURN}|recuperacion`. */
export const RIESGO_CHURN_RECUPERACION = 'recuperacion';

// ---------------------------------------------------------------------------
// Clínico (solo resumen para riesgo) — DetectedIssue + catálogo  (namespace bio)
// ---------------------------------------------------------------------------

/** `DetectedIssue.code.coding.system` de gating de terapias (GATE-PCR, GATE-HOMA, GATE-FERRITINA). */
export const CS_GATE_TERAPIA = `${NS.bio}/CodeSystem/gate-terapia`;
/** PlanDefinition con las reglas de gating. */
export const PLANDEF_GATING = `${NS.bio}/PlanDefinition/gating-terapias`;

// ---------------------------------------------------------------------------
// Operativo (de `recepcionistas`)  (namespace bw)
// ---------------------------------------------------------------------------

/** `identifier.system` de los ActivityDefinition de servicio (categoría en `topic[0].text`). */
export const CS_SERVICIO = `${NS.bw}/CodeSystem/servicio`;

/** Categorías de servicio (valor de `ActivityDefinition.topic[0].text`). */
export const CATEGORIAS_SERVICIO = [
  'HBOT',
  'IHHT',
  'RED_LIGHT',
  'MASAJE_OSTEOPATIA',
  'CRIO',
  'COMPRESION',
  'RECOVERY_PRO',
  'IV_THERAPY',
  'CONSULTA',
  'TERAPIA_BIOLOGICA',
] as const;
export type CategoriaServicio = (typeof CATEGORIAS_SERVICIO)[number];

/** Etiquetas es-AR para las categorías de servicio. */
export const CATEGORIA_SERVICIO_LABEL: Record<CategoriaServicio, string> = {
  HBOT: 'Cámara hiperbárica (HBOT)',
  IHHT: 'IHHT (hiperoxia–hipoxia)',
  RED_LIGHT: 'Luz Roja',
  MASAJE_OSTEOPATIA: 'Osteopatía / Masaje',
  CRIO: 'Crioterapia',
  COMPRESION: 'Compresión',
  RECOVERY_PRO: 'Recovery Pro',
  IV_THERAPY: 'Terapia IV / Sueros',
  CONSULTA: 'Consulta',
  TERAPIA_BIOLOGICA: 'Terapia biológica',
};

/** Extensión en Appointment con el código de servicio (valueString). */
export const SD_ITEM_CODIGO = `${NS.bw}/StructureDefinition/item-codigo`;
/** Extensión en Slot/Schedule que marca el cuello de botella de las tumbonas Red Light (R-07). */
export const SD_COMPARTE_TUMBONA = `${NS.bw}/StructureDefinition/comparte-tumbona`;

/** Extensiones de utilización de membresía en Coverage. */
export const SD_SESIONES_MES = `${NS.bw}/StructureDefinition/sesiones-mes`;
export const SD_SESIONES_USADAS = `${NS.bw}/StructureDefinition/sesiones-usadas`;

// ---------------------------------------------------------------------------
// Bots invocables (executeBot)
// ---------------------------------------------------------------------------

/**
 * `identifier.system` de los Bots de Medplum, para invocarlos por Identifier.
 * Nota: `enviar-campana` se invoca por id (ver `BOT_ENVIAR_CAMPANA_ID` en
 * campanas.ts); SID_BOT queda como referencia / futuros bots por identifier.
 */
export const SID_BOT = `${NS.bio}/sid/bot`;

/** Slugs (identifier.value) de los Bots, como referencia. */
export const BOTS = {
  enviarCampana: 'enviar-campana',
  promoverLead: 'promover-lead',
} as const;
