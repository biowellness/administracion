import { Center, Stack, Text, Title } from '@mantine/core';
import { SignInForm } from '@medplum/react';

/** Pantalla de login con el formulario de sign-in de Medplum. */
export function SignInPage(): JSX.Element {
  return (
    <Center h="100vh">
      <SignInForm>
        <Stack gap={2} align="center" mb="sm">
          <Title order={3}>BioWellness</Title>
          <Text c="dimmed" size="sm">
            Administración · ingresá con tu cuenta de Medplum
          </Text>
        </Stack>
      </SignInForm>
    </Center>
  );
}
