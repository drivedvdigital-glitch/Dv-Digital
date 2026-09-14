import { reactRouter } from '@react-router/dev/vite';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [reactRouter(), tsconfigPaths()],
  server: {
    // The dev tunnel presents a hostname this server never sees, so it has to
    // accept forwarded hosts. Without this the tunnel returns "Blocked request".
    allowedHosts: true,
    host: true,
  },
});
