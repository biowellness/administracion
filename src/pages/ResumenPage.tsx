import { Alert, Badge, Card, Group, Loader, Progress, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { ETAPA_PIPELINE_LABEL, GRUPOS_CRM, measureCrm } from '../fhir/systems';
import { groupValue, useMeasureReport } from '../hooks/useMeasureReport';
import { fmt } from '../lib/format';

/**
 * Resumen / Embudo — KPIs del CRM (leads, activos, conversión, churn, LTV) y embudo
 * de conversión, leyendo los MeasureReport que escribe el bot `kpis-crm` (uno por
 * métrica, por período): `embudo`, `clientes`, `conversion`, `churn`, `ltv-promedio`.
 *
 * Portado de `AdminDashboard.tsx`: usa el hook `useMeasureReport` y las constantes de
 * `src/fhir/systems.ts` en lugar de cadenas/lógica inline.
 */
export function ResumenPage(): JSX.Element {
  const embudo = useMeasureReport(measureCrm('embudo'));
  const clientes = useMeasureReport(measureCrm('clientes'));
  const conversion = useMeasureReport(measureCrm('conversion'));
  const churn = useMeasureReport(measureCrm('churn'));
  const ltv = useMeasureReport(measureCrm('ltv-promedio'));

  const loading =
    embudo.loading || clientes.loading || conversion.loading || churn.loading || ltv.loading;
  const error = embudo.error ?? clientes.error ?? conversion.error ?? churn.error ?? ltv.error;

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
        No se pudieron cargar los indicadores. Probá recargar la página.
      </Alert>
    );
  }

  const leads = groupValue(clientes.report, 'lead');
  const activos = groupValue(clientes.report, 'activo');
  const tasaConversion = groupValue(conversion.report, 'tasa');
  const churnAlto = groupValue(churn.report, 'alto');
  const ltvPromedio = groupValue(ltv.report, 'promedio');

  const valorEtapa = (code: string): number => groupValue(embudo.report, code);
  const tope = Math.max(valorEtapa('nuevo'), 1);
  const periodo = embudo.report?.period?.start?.slice(0, 7) ?? '';

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Title order={3}>Resumen</Title>
        {periodo && (
          <Badge variant="light" color="gray">
            {periodo}
          </Badge>
        )}
      </Group>

      <SimpleGrid cols={{ base: 2, sm: 5 }} spacing="sm">
        <KpiTile label="Leads" value={fmt(leads)} />
        <KpiTile label="Activos" value={fmt(activos)} />
        <KpiTile label="Conversión" value={`${fmt(tasaConversion)}%`} />
        <KpiTile label="Churn (alto)" value={fmt(churnAlto)} color={churnAlto > 0 ? 'orange' : undefined} />
        <KpiTile label="LTV promedio" value={`$${fmt(ltvPromedio)}`} />
      </SimpleGrid>

      <Card withBorder radius="md" padding="lg">
        <Text fw={500} mb="sm">
          Embudo de conversión
        </Text>
        <Stack gap="xs">
          {GRUPOS_CRM.embudo.map((code) => {
            const v = valorEtapa(code);
            const ratio = (v / tope) * 100; // crudo, para el ancho de la barra (fiel al original)
            const pct = Math.round(ratio); // redondeado, solo para el texto
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
                <Text size="xs" c="dimmed" w={48} ta="right">
                  {pct}%
                </Text>
              </Group>
            );
          })}
        </Stack>
      </Card>
    </Stack>
  );
}

function KpiTile({ label, value, color }: { label: string; value: string; color?: string }): JSX.Element {
  return (
    <Card bg="var(--mantine-color-default-hover)" radius="md" padding="md">
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text fz={24} fw={500} c={color}>
        {value}
      </Text>
    </Card>
  );
}
