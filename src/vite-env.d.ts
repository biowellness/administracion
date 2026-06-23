/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL base de la API de Medplum (ver .env.example). */
  readonly MEDPLUM_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
