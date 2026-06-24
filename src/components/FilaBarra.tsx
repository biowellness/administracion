import { Group, Progress, Text } from '@mantine/core';
import type { ReactNode } from 'react';

interface Props {
  /** Etiqueta a la izquierda. */
  label: string;
  /** Ancho de la barra en % (se clampea a [0, 100]). */
  ancho: number;
  /** Texto del valor a la derecha (p. ej. "85%" o "12"). */
  texto: string;
  color?: string;
  /** Badge opcional junto a la etiqueta (p. ej. "cuello de botella"). */
  badge?: ReactNode;
}

/** Fila con etiqueta + barra de progreso + valor; reutilizable en dashboards. */
export function FilaBarra({ label, ancho, texto, color, badge }: Props): JSX.Element {
  return (
    <Group gap="md" wrap="nowrap">
      <Group gap={6} w={220} wrap="nowrap">
        <Text size="sm" truncate>
          {label}
        </Text>
        {badge}
      </Group>
      <Progress
        value={Math.max(0, Math.min(100, ancho))}
        size="lg"
        radius="sm"
        style={{ flex: 1 }}
        color={color}
      />
      <Text size="sm" fw={500} w={64} ta="right">
        {texto}
      </Text>
    </Group>
  );
}
