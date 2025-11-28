// vite.config.js

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0' // <-- ¡Esta línea es crucial!
  },
  // CORRECCIÓN: Añadir configuración para manejar correctamente las rutas de Netlify Functions
  build: {
    rollupOptions: {
      output: {
        manualChunks: undefined
      }
    }
  },
  // CORRECCIÓN: Configurar el proxy para que no interfiera con las rutas de Netlify Functions
  server: {
    host: '0.0.0.0',
    proxy: {
      // CORRECCIÓN: Evitar que el proxy de Vite intercepte las peticiones a .netlify/functions
      '/.netlify': {
        target: 'http://localhost:8888',
        changeOrigin: true,
        secure: false,
        configure: (proxy, _options) => {
          // CORRECCIÓN: Deshabilitar el proxy para .netlify/functions
          proxy.on('error', (err, _req, _res) => {
            console.log('Proxy error:', err);
          });
        }
      }
    }
  }
});