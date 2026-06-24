import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Badge,
  Card,
  Group,
  Loader,
  Paper,
  ScrollArea,
  Stack,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { getDisplayString } from '@medplum/core';
import { useMedplum } from '@medplum/react';
import type { Patient, Practitioner, Provenance, Reference, Task } from '@medplum/fhirtypes';
import { IconRefresh, IconUser } from '@tabler/icons-react';
import {
  CS_ETAPA_PIPELINE,
  ETAPA_PIPELINE_LABEL,
  ETAPAS_PIPELINE,
  SD_LEAD_ORIGEN,
  TASK_INPUT_PROXIMA_ACCION,
} from '../fhir/systems';
import type { EtapaPipeline } from '../fhir/systems';

interface Tarjeta {
  task: Task;
  etapa: EtapaPipeline;
  paciente?: Patient;
  responsable?: Practitioner;
  fuente?: string;
  proximaAccion?: string;
}

function idDeRef(ref?: Reference): string | undefined {
  const r = ref?.reference;
  return r && r.includes('/') ? r.split('/')[1] : undefined;
}

function etapaDeTask(t: Task): EtapaPipeline | undefined {
  const code = t.businessStatus?.coding?.find((c) => c.system === CS_ETAPA_PIPELINE)?.code;
  return (ETAPAS_PIPELINE as readonly string[]).includes(code ?? '') ? (code as EtapaPipeline) : undefined;
}

function proximaAccionDe(t: Task): string | undefined {
  return t.input?.find((i) => i.type?.text === TASK_INPUT_PROXIMA_ACCION)?.valueString;
}

function fuenteDe(p?: Provenance): string | undefined {
  const origen = p?.extension?.find((e) => e.url === SD_LEAD_ORIGEN);
  const fuente = origen?.extension?.find((e) => e.url === 'fuente' || e.url.endsWith('/fuente'));
  return fuente?.valueString ?? fuente?.valueCode;
}

/**
 * Pipeline kanban — una columna por etapa (`Task.businessStatus`, system etapa-pipeline);
 * tarjetas con paciente (`Task.for`), fuente (del `Provenance` de atribución), responsable
 * (`Task.owner`) y próxima acción (`Task.input`). Arrastrar una tarjeta a otra columna
 * avanza la etapa con `updateResource` (optimista, con revert ante error).
 */
export function PipelinePage(): JSX.Element {
  const medplum = useMedplum();
  const [tarjetas, setTarjetas] = useState<Tarjeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error>();
  const [sobre, setSobre] = useState<EtapaPipeline | undefined>();

  const tarjetasRef = useRef<Tarjeta[]>([]);
  useEffect(() => {
    tarjetasRef.current = tarjetas;
  }, [tarjetas]);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      // Tasks cuya etapa pertenece al pipeline (OR de system|code para no traer Tasks ajenas).
      const businessStatus = ETAPAS_PIPELINE.map((e) => `${CS_ETAPA_PIPELINE}|${e}`).join(',');
      const tasks = await medplum.searchResources('Task', {
        'business-status': businessStatus,
        _count: '1000',
        _sort: '-_lastUpdated',
      });
      const tareas = tasks.filter((t) => etapaDeTask(t));

      const pacienteIds = [...new Set(tareas.map((t) => idDeRef(t.for)).filter(Boolean) as string[])];
      const practIds = [...new Set(tareas.map((t) => idDeRef(t.owner)).filter(Boolean) as string[])];

      const [pacientes, practs, provenances] = await Promise.all([
        pacienteIds.length
          ? medplum.searchResources('Patient', { _id: pacienteIds.join(','), _count: '1000' })
          : Promise.resolve<Patient[]>([]),
        practIds.length
          ? medplum.searchResources('Practitioner', { _id: practIds.join(','), _count: '1000' })
          : Promise.resolve<Practitioner[]>([]),
        pacienteIds.length
          ? medplum.searchResources('Provenance', {
              target: pacienteIds.map((id) => `Patient/${id}`).join(','),
              _count: '1000',
            })
          : Promise.resolve<Provenance[]>([]),
      ]);

      const pacientePorId = new Map(pacientes.filter((p) => p.id).map((p) => [p.id as string, p]));
      const practPorId = new Map(practs.filter((p) => p.id).map((p) => [p.id as string, p]));
      const provPorPaciente = new Map<string, Provenance>();
      for (const prov of provenances) {
        for (const tgt of prov.target ?? []) {
          const id = idDeRef(tgt);
          if (id && !provPorPaciente.has(id)) {
            provPorPaciente.set(id, prov);
          }
        }
      }

      const nuevas: Tarjeta[] = tareas.map((task) => {
        const pacienteId = idDeRef(task.for);
        const respId = idDeRef(task.owner);
        return {
          task,
          etapa: etapaDeTask(task) as EtapaPipeline,
          paciente: pacienteId ? pacientePorId.get(pacienteId) : undefined,
          responsable: respId ? practPorId.get(respId) : undefined,
          fuente: pacienteId ? fuenteDe(provPorPaciente.get(pacienteId)) : undefined,
          proximaAccion: proximaAccionDe(task),
        };
      });
      setTarjetas(nuevas);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [medplum]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const moverTarea = useCallback(
    async (taskId: string, destino: EtapaPipeline) => {
      const tarjeta = tarjetasRef.current.find((t) => t.task.id === taskId);
      if (!tarjeta || tarjeta.etapa === destino) {
        return;
      }
      const origen = tarjeta.etapa;
      setTarjetas((prev) => prev.map((t) => (t.task.id === taskId ? { ...t, etapa: destino } : t)));
      try {
        const actualizado = await medplum.updateResource<Task>({
          ...tarjeta.task,
          businessStatus: {
            text: ETAPA_PIPELINE_LABEL[destino],
            coding: [{ system: CS_ETAPA_PIPELINE, code: destino, display: ETAPA_PIPELINE_LABEL[destino] }],
          },
        });
        setTarjetas((prev) =>
          prev.map((t) => (t.task.id === taskId ? { ...t, task: actualizado, etapa: destino } : t))
        );
        notifications.show({ color: 'teal', message: `Movido a "${ETAPA_PIPELINE_LABEL[destino]}".` });
      } catch {
        setTarjetas((prev) => prev.map((t) => (t.task.id === taskId ? { ...t, etapa: origen } : t)));
        notifications.show({ color: 'red', title: 'Error', message: 'No se pudo mover la tarjeta.' });
      }
    },
    [medplum]
  );

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
        No se pudo cargar el pipeline. Probá recargar la página.
      </Alert>
    );
  }

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Title order={3}>Pipeline</Title>
        <Tooltip label="Actualizar">
          <ActionIcon variant="subtle" color="gray" onClick={() => cargar()} aria-label="Actualizar">
            <IconRefresh size={18} />
          </ActionIcon>
        </Tooltip>
      </Group>

      <ScrollArea type="auto" offsetScrollbars>
        <Group align="flex-start" wrap="nowrap" gap="md" pb="sm">
          {ETAPAS_PIPELINE.map((etapa) => {
            const items = tarjetas.filter((t) => t.etapa === etapa);
            return (
              <Paper
                key={etapa}
                withBorder
                radius="md"
                p="xs"
                style={{
                  flex: '0 0 280px',
                  backgroundColor: sobre === etapa ? 'var(--mantine-color-teal-0)' : undefined,
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setSobre(etapa);
                }}
                onDragLeave={() => setSobre((s) => (s === etapa ? undefined : s))}
                onDrop={(e) => {
                  e.preventDefault();
                  setSobre(undefined);
                  const id = e.dataTransfer.getData('text/plain');
                  if (id) {
                    void moverTarea(id, etapa);
                  }
                }}
              >
                <Group justify="space-between" px={4} mb="xs">
                  <Text fw={600} size="sm">
                    {ETAPA_PIPELINE_LABEL[etapa]}
                  </Text>
                  <Badge size="sm" variant="light" color="gray">
                    {items.length}
                  </Badge>
                </Group>
                <Stack gap="xs" mih={60}>
                  {items.length === 0 && (
                    <Text size="xs" c="dimmed" ta="center" py="md">
                      —
                    </Text>
                  )}
                  {items.map((t) => (
                    <TarjetaCard key={t.task.id} tarjeta={t} />
                  ))}
                </Stack>
              </Paper>
            );
          })}
        </Group>
      </ScrollArea>
    </Stack>
  );
}

function TarjetaCard({ tarjeta }: { tarjeta: Tarjeta }): JSX.Element {
  const { task, paciente, responsable, fuente, proximaAccion } = tarjeta;
  return (
    <Card
      withBorder
      radius="sm"
      padding="sm"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', task.id ?? '');
        e.dataTransfer.effectAllowed = 'move';
      }}
      style={{ cursor: 'grab' }}
    >
      <Text fw={500} size="sm" lineClamp={1}>
        {paciente ? getDisplayString(paciente) : 'Paciente'}
      </Text>
      {fuente && (
        <Badge size="xs" variant="light" color="blue" mt={4}>
          {fuente}
        </Badge>
      )}
      {proximaAccion && (
        <Text size="xs" c="dimmed" mt={6} lineClamp={2}>
          {proximaAccion}
        </Text>
      )}
      {responsable && (
        <Group gap={4} mt={6} wrap="nowrap">
          <IconUser size={12} />
          <Text size="xs" c="dimmed" lineClamp={1}>
            {getDisplayString(responsable)}
          </Text>
        </Group>
      )}
    </Card>
  );
}
