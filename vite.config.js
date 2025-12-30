// vite.config.js

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  
  // --- CONFIGURACIÓN DEL SERVIDOR (Fusionada) ---
  server: {
    host: '0.0.0.0', // Permitir acceso desde la red local
    proxy: {
      // Configuración para funciones de Netlify
      '/.netlify': {
        target: 'http://localhost:8888',
        changeOrigin: true,
        secure: false,
      }
    }
  },

  // --- CONFIGURACIÓN DE BUILD ---
  build: {
    rollupOptions: {
      output: {
        manualChunks: undefined
      }
    }
  }
});