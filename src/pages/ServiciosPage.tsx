import { Alert, Badge, Card, Group, Loader, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import type { MeasureReportGroup } from '@medplum/fhirtypes';
import { IconAlertTriangle } from '@tabler/icons-react';
import { KpiTile } from '../components/KpiTile';
import { CATEGORIA_SERVICIO_LABEL, measureServicios } from '../fhir/systems';
import { FilaBarra } from '../components/FilaBarra';
import { groupCode, groupLabel, groups, groupValue, useMeasureReport } from '../hooks/useMeasureReport';
import { fmt } from '../lib/format';

/**
 * Servicios — ocupación de agenda por recurso, turnos por servicio y utilización de
 * membresías, leyendo los MeasureReport de `kpis-servicios`
 * (`agenda-ocupacion`, `servicios-turnos`, `membresias-utilizacion`).
 *
 * El brief no fija los códigos de grupo de estos Measure (son por recurso/servicio,
 * dinámicos), así que leemos los grupos de forma genérica: el grupo `global` se usa
 * como total y el resto como filas. El cuello de botella (tumbonas Red Light) se marca
 * por umbral de ocupación y por detección de nombre — fácil de ajustar cuando se
 * confirme la salida exacta del bot.
 */
const OCUPACION_ALTA = 85; // % de ocupación a partir del cual marcamos cuello de botella

function esRedLight(label: string): boolean {
  const l = label.toLowerCase();
  return l.includes('red light') || l.includes('luz roja') || l.includes('tumbona') || l.includes('r-07');
}

/** Para turnos: si el código es una categoría conocida, usa su label es-AR. */
function labelTurnos(g: MeasureReportGroup): string {
  const code = groupCode(g);
  if (code && code in CATEGORIA_SERVICIO_LABEL) {
    return CATEGORIA_SERVICIO_LABEL[code as keyof typeof CATEGORIA_SERVICIO_LABEL];
  }
  return groupLabel(g);
}

interface Item {
  label: string;
  valor: number;
}

function recursosDe(report: MeasureReportGroup[], label: (g: MeasureReportGroup) => string = groupLabel): Item[] {
  return report
    .filter((g) => groupCode(g) !== 'global')
    .map((g) => ({ label: label(g), valor: g.measureScore?.value ?? 0 }))
    .sort((a, b) => b.valor - a.valor);
}

export function ServiciosPage(): JSX.Element {
  const turnos = useMeasureReport(measureServicios('servicios-turnos'));
  const ocupacion = useMeasureReport(measureServicios('agenda-ocupacion'));
  const membresias = useMeasureReport(measureServicios('membresias-utilizacion'));

  const loading = turnos.loading || ocupacion.loading || membresias.loading;
  const error = turnos.error ?? ocupacion.error ?? membresias.error;

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
        No se pudieron cargar las métricas de servicios. Probá recargar la página.
      </Alert>
    );
  }

  const periodo =
    ocupacion.report?.period?.start?.slice(0, 7) ??
    turnos.report?.period?.start?.slice(0, 7) ??
    membresias.report?.period?.start?.slice(0, 7) ??
    '';

  const turnosItems = recursosDe(groups(turnos.report), labelTurnos);
  const turnosTope = Math.max(...turnosItems.map((t) => t.valor), 1);
  const turnosTotal = groupValue(turnos.report, 'global') || turnosItems.reduce((s, t) => s + t.valor, 0);

  const ocupacionItems = recursosDe(groups(ocupacion.report));
  const ocupacionGlobal = groupValue(ocupacion.report, 'global');

  const membresiasItems = recursosDe(groups(membresias.report));
  const membresiasGlobal = groupValue(membresias.report, 'global');

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Title order={3}>Servicios</Title>
        {periodo && (
          <Badge variant="light" color="gray">
            {periodo}
          </Badge>
        )}
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
        <KpiTile label="Turnos del período" value={fmt(turnosTotal)} />
        <KpiTile label="Ocupación global" value={`${fmt(ocupacionGlobal)}%`} />
        <KpiTile label="Utilización membresías" value={`${fmt(membresiasGlobal)}%`} />
      </SimpleGrid>

      <Card withBorder radius="md" padding="lg">
        <Group justify="space-between" mb="sm">
          <Text fw={500}>Ocupación de agenda</Text>
          <Text size="sm" c="dimmed">
            Global {fmt(ocupacionGlobal)}%
          </Text>
        </Group>
        <Stack gap="xs">
          {ocupacionItems.length === 0 && (
            <Text size="sm" c="dimmed">
              Sin datos del período.
            </Text>
          )}
          {ocupacionItems.map((r) => {
            const bottleneck = r.valor >= OCUPACION_ALTA;
            const redLight = esRedLight(r.label);
            return (
              <FilaBarra
                key={r.label}
                label={r.label}
                ancho={r.valor}
                texto={`${fmt(r.valor)}%`}
                color={bottleneck ? 'orange' : 'teal'}
                badge={
                  bottleneck ? (
                    <Badge color="orange" variant="light" size="sm" leftSection={<IconAlertTriangle size={12} />}>
                      Cuello de botella
                    </Badge>
                  ) : redLight ? (
                    <Badge color="gray" variant="light" size="sm">
                      Tumbona compartida
                    </Badge>
                  ) : undefined
                }
              />
            );
          })}
        </Stack>
      </Card>

      <Card withBorder radius="md" padding="lg">
        <Text fw={500} mb="sm">
          Turnos por servicio
        </Text>
        <Stack gap="xs">
          {turnosItems.length === 0 && (
            <Text size="sm" c="dimmed">
              Sin datos del período.
            </Text>
          )}
          {turnosItems.map((t) => (
            <FilaBarra
              key={t.label}
              label={t.label}
              ancho={(t.valor / turnosTope) * 100}
              texto={fmt(t.valor)}
              color="blue"
            />
          ))}
        </Stack>
      </Card>

      <Card withBorder radius="md" padding="lg">
        <Group justify="space-between" mb="sm">
          <Text fw={500}>Utilización de membresías</Text>
          <Text size="sm" c="dimmed">
            Global {fmt(membresiasGlobal)}%
          </Text>
        </Group>
        <Stack gap="xs">
          {membresiasItems.length === 0 && (
            <Text size="sm" c="dimmed">
              Sin datos del período.
            </Text>
          )}
          {membresiasItems.map((m) => (
            <FilaBarra
              key={m.label}
              label={m.label}
              ancho={m.valor}
              texto={`${fmt(m.valor)}%`}
              color={m.valor >= OCUPACION_ALTA ? 'teal' : 'blue'}
            />
          ))}
        </Stack>
      </Card>
    </Stack>
  );
}
