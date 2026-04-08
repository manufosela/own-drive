import { defineConfig } from 'astro/config';
import lit from '@astrojs/lit';
import node from '@astrojs/node';

export default defineConfig({
  output: 'server',
  adapter: node({
    mode: 'standalone',
  }),
  security: {
    checkOrigin: false,
  },
  integrations: [lit()],
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  vite: {
    build: {
      rollupOptions: {
        external: ['next/server'],
      },
    },
  },
});
