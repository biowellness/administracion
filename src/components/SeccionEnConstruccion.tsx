import { Card, Stack, Text, Title } from '@mantine/core';

interface Props {
  titulo: string;
  descripcion: string;
}

/** Placeholder de sección todavía no implementada (scaffolding). */
export function SeccionEnConstruccion({ titulo, descripcion }: Props): JSX.Element {
  return (
    <Stack gap="md">
      <Title order={3}>{titulo}</Title>
      <Card withBorder radius="md" padding="lg">
        <Stack gap={4}>
          <Text fw={500}>En construcción</Text>
          <Text size="sm" c="dimmed">
            {descripcion}
          </Text>
        </Stack>
      </Card>
    </Stack>
  );
}
