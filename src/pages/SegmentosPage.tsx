import { useCallback, useEffect, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Stack,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { useMedplum } from '@medplum/react';
import type { Group as FhirGroup, GroupCharacteristic } from '@medplum/fhirtypes';
import { IconRefresh, IconSpeakerphone } from '@tabler/icons-react';
import { LanzarCampanaModal } from '../components/LanzarCampanaModal';
import { CS_RASGO_SEGMENTO, RASGO_SEGMENTO_LABEL, SID_SEGMENTO } from '../fhir/systems';

function miembrosDe(g: FhirGroup): number {
  return g.quantity ?? g.member?.length ?? 0;
}

function rasgoDe(c: GroupCharacteristic): string {
  const code = c.code?.coding?.find((x) => x.system === CS_RASGO_SEGMENTO)?.code;
  if (code && code in RASGO_SEGMENTO_LABEL) {
    return RASGO_SEGMENTO_LABEL[code as keyof typeof RASGO_SEGMENTO_LABEL];
  }
  return c.code?.text ?? c.code?.coding?.[0]?.display ?? code ?? 'Criterio';
}

function valorDe(c: GroupCharacteristic): string {
  if (c.valueCodeableConcept) {
    return (
      c.valueCodeableConcept.text ??
      c.valueCodeableConcept.coding?.[0]?.display ??
      c.valueCodeableConcept.coding?.[0]?.code ??
      ''
    );
  }
  if (typeof c.valueBoolean === 'boolean') {
    return c.valueBoolean ? 'Sí' : 'No';
  }
  if (c.valueQuantity) {
    const q = c.valueQuantity;
    return `${q.comparator ?? ''}${q.value ?? ''} ${q.unit ?? ''}`.trim();
  }
  if (c.valueRange) {
    const r = c.valueRange;
    return `${r.low?.value ?? ''}–${r.high?.value ?? ''}`.replace(/^–|–$/g, '').trim();
  }
  if (c.valueReference) {
    return c.valueReference.display ?? c.valueReference.reference ?? '';
  }
  return '';
}

function criterioTexto(c: GroupCharacteristic): string {
  const valor = valorDe(c);
  const base = valor ? `${rasgoDe(c)}: ${valor}` : rasgoDe(c);
  return c.exclude ? `excluye ${base}` : base;
}

/**
 * Segmentos — lista de `Group` de segmentación (identifier system segmento) con su
 * cantidad de miembros y criterios (`characteristic[]`), y acción para lanzar una
 * campaña al segmento (bot `enviar-campana`).
 */
export function SegmentosPage(): JSX.Element {
  const medplum = useMedplum();
  const [segmentos, setSegmentos] = useState<FhirGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error>();
  const [destino, setDestino] = useState<FhirGroup | undefined>();

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const grupos = await medplum.searchResources('Group', {
        identifier: `${SID_SEGMENTO}|`,
        _count: '1000',
        _sort: '-_lastUpdated',
      });
      setSegmentos(grupos);
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
        No se pudieron cargar los segmentos. Probá recargar la página.
      </Alert>
    );
  }

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Title order={3}>Segmentos</Title>
        <Tooltip label="Actualizar">
          <ActionIcon variant="subtle" color="gray" onClick={() => cargar()} aria-label="Actualizar">
            <IconRefresh size={18} />
          </ActionIcon>
        </Tooltip>
      </Group>

      {segmentos.length === 0 ? (
        <Alert color="gray" variant="light" title="Sin segmentos">
          No hay Group de segmentación todavía.
        </Alert>
      ) : (
        <Stack gap="sm">
          {segmentos.map((s) => {
            const criterios = s.characteristic ?? [];
            return (
              <Card key={s.id} withBorder radius="md" padding="lg">
                <Group justify="space-between" align="flex-start" wrap="nowrap">
                  <Stack gap="xs" style={{ minWidth: 0 }}>
                    <Group gap="xs">
                      <Text fw={500}>{s.name ?? 'Segmento'}</Text>
                      <Badge variant="light" color="gray">
                        {miembrosDe(s)} miembros
                      </Badge>
                    </Group>
                    {criterios.length > 0 && (
                      <Group gap={6}>
                        {criterios.map((c, i) => (
                          <Badge key={`${s.id}-${i}`} variant="outline" color="teal" size="sm">
                            {criterioTexto(c)}
                          </Badge>
                        ))}
                      </Group>
                    )}
                  </Stack>
                  <Button
                    size="xs"
                    variant="light"
                    leftSection={<IconSpeakerphone size={14} />}
                    onClick={() => setDestino(s)}
                  >
                    Lanzar campaña
                  </Button>
                </Group>
              </Card>
            );
          })}
        </Stack>
      )}

      {destino && (
        <LanzarCampanaModal
          opened={!!destino}
          onClose={() => setDestino(undefined)}
          titulo="Lanzar campaña"
          resumenDestino={`Segmento «${destino.name ?? 'Segmento'}» · ${miembrosDe(destino)} miembros`}
          resolverGroupId={() =>
            destino.id ? Promise.resolve(destino.id) : Promise.reject(new Error('Segmento sin id'))
          }
        />
      )}
    </Stack>
  );
}
