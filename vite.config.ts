/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { VitePWA } from 'vite-plugin-pwa'

// BASE_PATH serve quando l'app è pubblicata in una sottocartella (es. GitHub Pages: /spesasmart/).
export default defineConfig(({ mode }) => ({
  base: process.env.BASE_PATH ?? '/',
  plugins: [
    react(),
    tailwindcss(),
    // "npm run dev:telefono": HTTPS locale, necessario per usare la fotocamera dal telefono in rete Wi-Fi.
    ...(mode === 'phone' ? [basicSsl()] : []),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'favicon.ico', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'SpesaSmart',
        short_name: 'SpesaSmart',
        description: 'Liste della spesa, confronto prezzi tra supermercati e costi di spostamento',
        lang: 'it',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#15803d',
        background_color: '#f6f7f4',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        globIgnores: ['**/data/**'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/data/carburanti/'),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'carburanti', expiration: { maxEntries: 80, maxAgeSeconds: 7 * 86400 } },
          },
          {
            urlPattern: /^https:\/\/tile\.openstreetmap\.org\//,
            handler: 'CacheFirst',
            options: { cacheName: 'mappa', expiration: { maxEntries: 300, maxAgeSeconds: 7 * 86400 } },
          },
          {
            urlPattern: /^https:\/\/images\.openfoodfacts\.org\//,
            handler: 'CacheFirst',
            options: { cacheName: 'immagini-prodotti', expiration: { maxEntries: 400, maxAgeSeconds: 30 * 86400 } },
          },
        ],
      },
    }),
  ],
  test: { environment: 'node', include: ['src/**/*.test.ts', 'scripts/**/*.test.mjs'] },
}))
