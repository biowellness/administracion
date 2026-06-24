import type { MedplumClient } from '@medplum/core';
import type { Group } from '@medplum/fhirtypes';
import { SID_GRUPO_ADHOC } from './systems';

/**
 * Id (UUID) del Bot `enviar-campana`. Configurable por env var
 * `MEDPLUM_BOT_ENVIAR_CAMPANA`; el default es el id real conocido.
 */
export const BOT_ENVIAR_CAMPANA_ID =
  import.meta.env.MEDPLUM_BOT_ENVIAR_CAMPANA ?? 'd3f0e16b-79fd-4fc9-8346-157d6f48ea18';

/** Canales soportados por `enviar-campana` (valor enviado al bot en `canal`). */
export type Canal = 'email' | 'whatsapp';

export const CANAL_LABEL: Record<Canal, string> = {
  email: 'Email',
  whatsapp: 'WhatsApp',
};

export const CANALES: Canal[] = ['email', 'whatsapp'];

export interface DatosCampana {
  groupId: string;
  canal: Canal;
  asunto: string;
  cuerpo: string;
  /** Si no se pasa, se genera uno nuevo. */
  campaniaId?: string;
}

/** Genera un id de campaña único. */
export function nuevaCampaniaId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ? `camp-${uuid.slice(0, 8)}` : `camp-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Lanza una campaña invocando el bot `enviar-campana` por id.
 * Contrato: `executeBot(BOT_ENVIAR_CAMPANA_ID, { groupId, canal, asunto, cuerpo, campaniaId })`.
 */
export async function lanzarCampana(medplum: MedplumClient, datos: DatosCampana): Promise<{ campaniaId: string }> {
  const campaniaId = datos.campaniaId ?? nuevaCampaniaId();
  await medplum.executeBot(BOT_ENVIAR_CAMPANA_ID, {
    groupId: datos.groupId,
    canal: datos.canal,
    asunto: datos.asunto,
    cuerpo: datos.cuerpo,
    campaniaId,
  });
  return { campaniaId };
}

/**
 * Crea un Group ad-hoc (no es un segmento) con los pacientes dados, para usarlo como
 * destino de una campaña puntual (p. ej. recuperación de churn).
 */
export async function crearGrupoAdHoc(
  medplum: MedplumClient,
  nombre: string,
  pacienteIds: string[]
): Promise<Group> {
  return medplum.createResource<Group>({
    resourceType: 'Group',
    type: 'person',
    actual: true,
    name: nombre,
    quantity: pacienteIds.length,
    identifier: [{ system: SID_GRUPO_ADHOC, value: nuevaCampaniaId() }],
    member: pacienteIds.map((id) => ({ entity: { reference: `Patient/${id}` } })),
  });
}
