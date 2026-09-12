import { fileURLToPath } from 'node:url';
export default {
  root: fileURLToPath(new URL('.', import.meta.url)),
  resolve: {
    alias: { '@': fileURLToPath(new URL('../../../src', import.meta.url)) },
  },
  server: { port: 3031, strictPort: true },
};
