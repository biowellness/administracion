import { Alert, Badge, Card, Group, Loader, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { FilaBarra } from '../components/FilaBarra';
import { KpiTile } from '../components/KpiTile';
import { measureCrm } from '../fhir/systems';
import { groupCode, groupLabel, groups, groupValue, useMeasureReport } from '../hooks/useMeasureReport';
import { fmt } from '../lib/format';

/**
 * Financiero — LTV por segmento. Lee el MeasureReport `ltv-segmento` (kpis-crm), con un
 * grupo por segmento (`group[].code` = segmento, `measureScore.value` = LTV en ARS), y
 * el `ltv-promedio` global como referencia. Mismo patrón de lectura que el resto.
 *
 * Tarea futura del brief: el slug `ltv-segmento` está asumido (ver systems.ts).
 */
export function FinancieroPage(): JSX.Element {
  const ltvSegmento = useMeasureReport(measureCrm('ltv-segmento'));
  const ltvGlobal = useMeasureReport(measureCrm('ltv-promedio'));

  const loading = ltvSegmento.loading || ltvGlobal.loading;
  const error = ltvSegmento.error ?? ltvGlobal.error;

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
        No se pudo cargar el financiero. Probá recargar la página.
      </Alert>
    );
  }

  const promedioGlobal = groupValue(ltvGlobal.report, 'promedio');
  const segmentos = groups(ltvSegmento.report)
    .filter((g) => groupCode(g) !== 'global')
    .map((g) => ({ label: groupLabel(g), valor: g.measureScore?.value ?? 0 }))
    .sort((a, b) => b.valor - a.valor);
  const tope = Math.max(...segmentos.map((s) => s.valor), 1);
  const maximo = segmentos[0]?.valor ?? 0;
  const periodo =
    ltvSegmento.report?.period?.start?.slice(0, 7) ?? ltvGlobal.report?.period?.start?.slice(0, 7) ?? '';

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Title order={3}>Financiero</Title>
        {periodo && (
          <Badge variant="light" color="gray">
            {periodo}
          </Badge>
        )}
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
        <KpiTile label="LTV promedio (global)" value={`$${fmt(promedioGlobal)}`} />
        <KpiTile label="Segmentos con dato" value={String(segmentos.length)} />
        <KpiTile label="LTV máximo" value={`$${fmt(maximo)}`} color="teal" />
      </SimpleGrid>

      <Card withBorder radius="md" padding="lg">
        <Text fw={500} mb="sm">
          LTV por segmento
        </Text>
        <Stack gap="xs">
          {segmentos.length === 0 && (
            <Text size="sm" c="dimmed">
              Sin datos del período.
            </Text>
          )}
          {segmentos.map((s) => (
            <FilaBarra
              key={s.label}
              label={s.label}
              ancho={(s.valor / tope) * 100}
              texto={`$${fmt(s.valor)}`}
              color="teal"
            />
          ))}
        </Stack>
      </Card>
    </Stack>
  );
}
