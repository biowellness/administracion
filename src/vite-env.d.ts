/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL base de la API de Medplum (ver .env.example). */
  readonly MEDPLUM_BASE_URL?: string;
  /** Id (UUID) del Bot enviar-campana. Si no se define, usa el default en campanas.ts. */
  readonly MEDPLUM_BOT_ENVIAR_CAMPANA?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Asset .xlsx importado como URL (el modelo del tablero, para el template vivo). */
declare module '*.xlsx?url' {
  const src: string;
  export default src;
}
