import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';

/* `npm run dev` serves the app with instant reload; `npm run build` writes
   dist/, the folder that gets uploaded to hosting. The PWA plugin adds what
   Android needs to install it from the browser: a manifest and a service
   worker that keeps the app working offline. */
export default defineConfig({
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Holly',
        short_name: 'Holly',
        description:
          'Recurring cleaning tasks on a floor plan of the house, with a daily budget of steps.',
        theme_color: '#121A2B',
        background_color: '#121A2B',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '.',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  server: { port: 5181, strictPort: true },
});
