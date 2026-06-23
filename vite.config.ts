import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// El brief usa `import.meta.env.MEDPLUM_BASE_URL` (sin prefijo VITE_),
// por eso exponemos las variables con prefijo MEDPLUM_ al cliente.
export default defineConfig({
  plugins: [react()],
  envPrefix: ['MEDPLUM_'],
  preview: {
    port: 3002,
    allowedHosts: true,
    host: 'admin.medplum.com.ar',
  },
  server: {
    port: 3002,
    host: 'localhost',
  },
});
