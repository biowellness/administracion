import { Card, Text } from '@mantine/core';

interface Props {
  label: string;
  value: string;
  color?: string;
}

/** Tile compacto de KPI (label arriba, valor grande). Compartido por Resumen y Servicios. */
export function KpiTile({ label, value, color }: Props): JSX.Element {
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
