import { useCallback, useEffect, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Badge,
  Card,
  Group,
  Loader,
  SimpleGrid,
  Stack,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { getDisplayString } from '@medplum/core';
import { useMedplum } from '@medplum/react';
import type { Flag, Patient, Task } from '@medplum/fhirtypes';
import { IconRefresh } from '@tabler/icons-react';
import { KpiTile } from '../components/KpiTile';
import { idDeRef } from '../fhir/refs';
import {
  CS_CATEGORIA_FLAG,
  CS_RIESGO_CHURN,
  FLAG_CHURN_RISK,
  RIESGO_CHURN_NIVELES,
  RIESGO_CHURN_RECUPERACION,
} from '../fhir/systems';
import type { RiesgoChurn } from '../fhir/systems';

interface ItemRetencion {
  flag: Flag;
  nivel: RiesgoChurn;
  pacienteId?: string;
  paciente?: Patient;
  enRecuperacion: boolean;
}

const COLOR_NIVEL: Record<RiesgoChurn, string> = { alto: 'red', medio: 'orange', bajo: 'yellow' };
const NIVEL_LABEL: Record<RiesgoChurn, string> = { alto: 'Riesgo alto', medio: 'Riesgo medio', bajo: 'Riesgo bajo' };
const ORDEN_NIVEL: RiesgoChurn[] = ['alto', 'medio', 'bajo'];

// Estados de Task que NO cuentan como "recuperación en curso".
const TASK_CERRADA = new Set(['draft', 'rejected', 'cancelled', 'failed', 'completed', 'entered-in-error']);

function esChurnRisk(f: Flag): boolean {
  return !!f.category?.some((cc) =>
    cc.coding?.some((c) => c.system === CS_CATEGORIA_FLAG && c.code === FLAG_CHURN_RISK)
  );
}

function nivelDeFlag(f: Flag): RiesgoChurn | undefined {
  const code = f.code?.coding?.find((c) => c.system === CS_RIESGO_CHURN)?.code;
  return (RIESGO_CHURN_NIVELES as readonly string[]).includes(code ?? '') ? (code as RiesgoChurn) : undefined;
}

function tareaAbierta(t: Task): boolean {
  return !TASK_CERRADA.has(t.status ?? '');
}

/**
 * Retención — pacientes con riesgo de churn (`Flag` category churn-risk), agrupados por
 * nivel (alto/medio/bajo), con indicador de si tienen una recuperación en curso
 * (`Task` code riesgo-churn|recuperacion abierto).
 *
 * Dashboard de lectura: la acción «iniciar recuperación» (enviar-campana) se integra
 * con Campañas (Tarea 7). `Flag` no tiene search param estándar R4 para category/status,
 * así que se traen los Flag y se filtran del lado del cliente.
 */
export function RetencionPage(): JSX.Element {
  const medplum = useMedplum();
  const [items, setItems] = useState<ItemRetencion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error>();

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const flags = await medplum.searchResources('Flag', { _count: '1000', _sort: '-_lastUpdated' });
      const churn = flags.filter((f) => f.status === 'active' && esChurnRisk(f) && nivelDeFlag(f));
      const pacienteIds = [...new Set(churn.map((f) => idDeRef(f.subject)).filter(Boolean) as string[])];

      const [pacientes, recTasks] = await Promise.all([
        pacienteIds.length
          ? medplum.searchResources('Patient', { _id: pacienteIds.join(','), _count: '1000' })
          : Promise.resolve<Patient[]>([]),
        medplum.searchResources('Task', {
          code: `${CS_RIESGO_CHURN}|${RIESGO_CHURN_RECUPERACION}`,
          _count: '1000',
        }),
      ]);

      const pacientePorId = new Map(pacientes.filter((p) => p.id).map((p) => [p.id as string, p]));
      const enRecup = new Set<string>();
      for (const t of recTasks) {
        if (tareaAbierta(t)) {
          const id = idDeRef(t.for);
          if (id) {
            enRecup.add(id);
          }
        }
      }

      const nuevos: ItemRetencion[] = churn.map((flag) => {
        const pacienteId = idDeRef(flag.subject);
        return {
          flag,
          nivel: nivelDeFlag(flag) as RiesgoChurn,
          pacienteId,
          paciente: pacienteId ? pacientePorId.get(pacienteId) : undefined,
          enRecuperacion: pacienteId ? enRecup.has(pacienteId) : false,
        };
      });
      setItems(nuevos);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [medplum]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  if (loading) {
    return (
      <Group justify="center" p="xl">
        <Loader />
      </Group>
    );
  }

  if (error) {
    return (
      <Alert color="red" title="Error" variant="light">
        No se pudo cargar la retención. Probá recargar la página.
      </Alert>
    );
  }

  const total = items.length;
  const enRecuperacion = items.filter((i) => i.enRecuperacion).length;
  const porNivel = (n: RiesgoChurn): ItemRetencion[] => items.filter((i) => i.nivel === n);

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Title order={3}>Retención</Title>
        <Tooltip label="Actualizar">
          <ActionIcon variant="subtle" color="gray" onClick={() => cargar()} aria-label="Actualizar">
            <IconRefresh size={18} />
          </ActionIcon>
        </Tooltip>
      </Group>

      <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
        <KpiTile label="Riesgo alto" value={String(porNivel('alto').length)} color="red" />
        <KpiTile label="Riesgo medio" value={String(porNivel('medio').length)} color="orange" />
        <KpiTile label="Riesgo bajo" value={String(porNivel('bajo').length)} />
        <KpiTile label="En recuperación" value={String(enRecuperacion)} color="teal" />
      </SimpleGrid>

      {total === 0 ? (
        <Alert color="teal" variant="light" title="Sin pacientes en riesgo">
          No hay Flags de churn-risk activos en este momento.
        </Alert>
      ) : (
        ORDEN_NIVEL.map((nivel) => {
          const filas = porNivel(nivel);
          return (
            <Card key={nivel} withBorder radius="md" padding="lg">
              <Group justify="space-between" mb="sm">
                <Group gap="xs">
                  <Text fw={500}>{NIVEL_LABEL[nivel]}</Text>
                  <Badge variant="light" color={COLOR_NIVEL[nivel]}>
                    {filas.length}
                  </Badge>
                </Group>
              </Group>
              <Stack gap={6}>
                {filas.length === 0 && (
                  <Text size="sm" c="dimmed">
                    Sin pacientes en este nivel.
                  </Text>
                )}
                {filas.map((it) => (
                  <Group key={it.flag.id} justify="space-between" wrap="nowrap">
                    <Text size="sm" lineClamp={1}>
                      {it.paciente ? getDisplayString(it.paciente) : 'Paciente'}
                    </Text>
                    {it.enRecuperacion ? (
                      <Badge size="sm" variant="light" color="teal">
                        Recuperación en curso
                      </Badge>
                    ) : (
                      <Badge size="sm" variant="light" color="gray">
                        Sin recuperación
                      </Badge>
                    )}
                  </Group>
                ))}
              </Stack>
            </Card>
          );
        })
      )}
    </Stack>
  );
}
