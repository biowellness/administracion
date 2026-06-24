import { Card, Text } from '@mantine/core';

interface Props {
  label: string;
  value: string;
  color?: string;
  /** Subtítulo dim opcional (p. ej. el equivalente en USD). */
  sub?: string;
}

/** Tile compacto de KPI (label arriba, valor grande, subtítulo opcional). */
export function KpiTile({ label, value, color, sub }: Props): JSX.Element {
  return (
    <Card bg="var(--mantine-color-default-hover)" radius="md" padding="md">
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text fz={24} fw={500} c={color}>
        {value}
      </Text>
      {sub && (
        <Text size="xs" c="dimmed">
          {sub}
        </Text>
      )}
    </Card>
  );
}
