import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['pwa-icon.svg', 'pwa-icon-maskable.svg'],
      manifest: {
        name: 'Social Media Stage Todos',
        short_name: 'SM Todos',
        description: 'Swipeable 5-stage todo manager for social media content production.',
        theme_color: '#f1f5f9',
        background_color: '#f1f5f9',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: '/pwa-icon.svg',
            sizes: '512x512',
            type: 'image/svg+xml'
          },
          {
            src: '/pwa-icon-maskable.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}']
      }
    })
  ]
});
