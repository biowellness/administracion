import { useCallback, useEffect, useState } from 'react';
import { ActionIcon, Alert, Card, Group, Loader, Stack, Table, Text, Title, Tooltip } from '@mantine/core';
import { useMedplum } from '@medplum/react';
import type { Communication } from '@medplum/fhirtypes';
import { IconRefresh } from '@tabler/icons-react';
import { SID_CAMPANIA } from '../fhir/systems';

interface ResumenCampania {
  id: string;
  total: number;
  enviados: number;
  respondidos: number;
  ultimoEnvio?: string;
}

function campaniaDe(c: Communication): string | undefined {
  return c.identifier?.find((i) => i.system === SID_CAMPANIA)?.value;
}

function fueEnviado(c: Communication): boolean {
  return !!c.sent || c.status === 'in-progress' || c.status === 'completed';
}

function fueRespondido(c: Communication): boolean {
  return !!c.received || (c.inResponseTo?.length ?? 0) > 0;
}

function fmtFecha(iso?: string): string {
  if (!iso) {
    return '—';
  }
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : new Intl.DateTimeFormat('es-AR').format(d);
}

/**
 * Campañas — panel de tracking de `Communication` por campaña (identifier system
 * campania). Agrega por campaña: total de mensajes, enviados y respondidos, y la
 * fecha del último envío.
 *
 * Nota: el "abierto" depende de cómo el bot `enviar-campana` represente la apertura
 * (campo/extensión propios); enviados/respondidos se derivan de Communication.sent/
 * received e inResponseTo. Fácil de extender cuando se confirme ese campo.
 */
export function CampanasPage(): JSX.Element {
  const medplum = useMedplum();
  const [resumenes, setResumenes] = useState<ResumenCampania[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error>();

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const comms = await medplum.searchResources('Communication', {
        identifier: `${SID_CAMPANIA}|`,
        _count: '1000',
        _sort: '-sent',
      });

      const porCampania = new Map<string, ResumenCampania>();
      for (const c of comms) {
        const id = campaniaDe(c);
        if (!id) {
          continue;
        }
        const r = porCampania.get(id) ?? { id, total: 0, enviados: 0, respondidos: 0 };
        r.total += 1;
        if (fueEnviado(c)) {
          r.enviados += 1;
        }
        if (fueRespondido(c)) {
          r.respondidos += 1;
        }
        if (c.sent && (!r.ultimoEnvio || c.sent > r.ultimoEnvio)) {
          r.ultimoEnvio = c.sent;
        }
        porCampania.set(id, r);
      }
      setResumenes([...porCampania.values()].sort((a, b) => (b.ultimoEnvio ?? '').localeCompare(a.ultimoEnvio ?? '')));
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
        No se pudieron cargar las campañas. Probá recargar la página.
      </Alert>
    );
  }

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Title order={3}>Campañas</Title>
        <Tooltip label="Actualizar">
          <ActionIcon variant="subtle" color="gray" onClick={() => cargar()} aria-label="Actualizar">
            <IconRefresh size={18} />
          </ActionIcon>
        </Tooltip>
      </Group>

      {resumenes.length === 0 ? (
        <Alert color="gray" variant="light" title="Sin campañas">
          No hay Communication de campaña todavía. Lanzá una desde Segmentos o Retención.
        </Alert>
      ) : (
        <Card withBorder radius="md" padding={0}>
          <Table.ScrollContainer minWidth={520}>
            <Table striped highlightOnHover verticalSpacing="sm" horizontalSpacing="md">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Campaña</Table.Th>
                  <Table.Th ta="right">Mensajes</Table.Th>
                  <Table.Th ta="right">Enviados</Table.Th>
                  <Table.Th ta="right">Respondidos</Table.Th>
                  <Table.Th>Último envío</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {resumenes.map((r) => (
                  <Table.Tr key={r.id}>
                    <Table.Td>
                      <Text size="sm" fw={500}>
                        {r.id}
                      </Text>
                    </Table.Td>
                    <Table.Td ta="right">{r.total}</Table.Td>
                    <Table.Td ta="right">{r.enviados}</Table.Td>
                    <Table.Td ta="right">{r.respondidos}</Table.Td>
                    <Table.Td>{fmtFecha(r.ultimoEnvio)}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Card>
      )}
    </Stack>
  );
}
