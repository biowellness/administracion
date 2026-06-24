import { Alert, Badge, Card, Group, Loader, Progress, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { KpiTile } from '../components/KpiTile';
import { ETAPA_PIPELINE_LABEL, GRUPOS_CRM, measureCrm, measureFinanzas, measureServicios } from '../fhir/systems';
import { groupValue, useMeasureReport } from '../hooks/useMeasureReport';
import { useTipoCambio } from '../fhir/reportes';
import { fmt, fmt2 } from '../lib/format';

/**
 * Dashboard ejecutivo (para Andrés) — vista consolidada en tiempo real: ingresos del
 * día, membresías activas, ocupación de salas, margen estimado, conversión y embudo de
 * CRM. Lee MeasureReports de kpis-crm / kpis-servicios / kpis-finanzas.
 */
export function DashboardPage(): JSX.Element {
  const ingresos = useMeasureReport(measureFinanzas('ingresos'));
  const margen = useMeasureReport(measureFinanzas('margen'));
  const clientes = useMeasureReport(measureCrm('clientes'));
  const conversion = useMeasureReport(measureCrm('conversion'));
  const embudo = useMeasureReport(measureCrm('embudo'));
  const ocupacion = useMeasureReport(measureServicios('agenda-ocupacion'));
  const { tcUsd } = useTipoCambio();

  const loading =
    ingresos.loading ||
    margen.loading ||
    clientes.loading ||
    conversion.loading ||
    embudo.loading ||
    ocupacion.loading;

  if (loading) {
    return (
      <Group justify="center" p="xl">
        <Loader />
      </Group>
    );
  }

  const ingresosDia = groupValue(ingresos.report, 'dia');
  const margenEstimado = groupValue(margen.report, 'estimado');
  const activos = groupValue(clientes.report, 'activo');
  const tasaConversion = groupValue(conversion.report, 'tasa');
  const ocupGlobal = groupValue(ocupacion.report, 'global');
  const periodo = ingresos.report?.period?.start?.slice(0, 7) ?? embudo.report?.period?.start?.slice(0, 7) ?? '';

  const usd = (ars: number): string | undefined => (tcUsd > 0 ? `US$ ${fmt(ars / tcUsd)}` : undefined);
  const tope = Math.max(groupValue(embudo.report, 'nuevo'), 1);

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Title order={3}>Dashboard</Title>
        <Group gap="xs">
          <Badge variant="light" color={tcUsd > 0 ? 'teal' : 'gray'}>
            {tcUsd > 0 ? `TC USD $${fmt2(tcUsd)}` : 'TC USD sin dato'}
          </Badge>
          {periodo && (
            <Badge variant="light" color="gray">
              {periodo}
            </Badge>
          )}
        </Group>
      </Group>

      <SimpleGrid cols={{ base: 2, sm: 3, lg: 5 }} spacing="sm">
        <KpiTile label="Ingresos del día" value={`$${fmt(ingresosDia)}`} sub={usd(ingresosDia)} color="teal" />
        <KpiTile label="Margen estimado" value={`$${fmt(margenEstimado)}`} sub={usd(margenEstimado)} />
        <KpiTile label="Membresías activas" value={fmt(activos)} />
        <KpiTile label="Ocupación salas" value={`${fmt(ocupGlobal)}%`} color={ocupGlobal >= 85 ? 'orange' : undefined} />
        <KpiTile label="Conversión" value={`${fmt(tasaConversion)}%`} />
      </SimpleGrid>

      <Card withBorder radius="md" padding="lg">
        <Text fw={500} mb="sm">
          Embudo de CRM
        </Text>
        <Stack gap="xs">
          {GRUPOS_CRM.embudo.map((code) => {
            const v = groupValue(embudo.report, code);
            const ratio = (v / tope) * 100;
            return (
              <Group key={code} gap="md" wrap="nowrap">
                <Text size="sm" w={170}>
                  {ETAPA_PIPELINE_LABEL[code]}
                </Text>
                <Progress
                  value={ratio}
                  size="lg"
                  radius="sm"
                  style={{ flex: 1 }}
                  color={code === 'convertido' ? 'teal' : 'blue'}
                />
                <Text size="sm" fw={500} w={48} ta="right">
                  {fmt(v)}
                </Text>
              </Group>
            );
          })}
        </Stack>
      </Card>

      <Alert color="gray" variant="light">
        Ingresos y margen dependen de los Measure de <Text span fw={500}>kpis-finanzas</Text>{' '}
        (<Text span fw={500}>ingresos</Text>, <Text span fw={500}>margen</Text>, <Text span fw={500}>tipo-cambio</Text>);
        hasta que el bot los publique se ven en cero.
      </Alert>
    </Stack>
  );
}
