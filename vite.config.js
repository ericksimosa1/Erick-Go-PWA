// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function copySWPlugin() {
  return {
    name: 'copy-service-worker',
    writeBundle() {
      try {
        const swSource = path.resolve(__dirname, 'public/sw.js');
        const swDest = path.resolve(__dirname, 'dist/sw.js');
        
        if (fs.existsSync(swSource)) {
          fs.copyFileSync(swSource, swDest);
          console.log('✅ [Vite Plugin] Service Worker copiado exitosamente');
        }
      } catch (error) {
        console.error('❌ [Vite Plugin] Error:', error);
      }
    }
  };
}

export default defineConfig({
  plugins: [
    react(),
    copySWPlugin()
  ],
  
  server: {
    host: '0.0.0.0',
    // CONFIGURACIÓN BLINDADA:
    // 1. Desactivamos HMR (Hot Module Replacement) para evitar recargas automáticas.
    // 2. Desactivamos el watch de archivos para que el servidor no intente reiniciarse.
    hmr: false,
    watch: {
      usePolling: false
    },
    
    proxy: {
      '/.netlify': {
        target: 'http://localhost:8888',
        changeOrigin: true,
        secure: false,
      }
    }
  },

  build: {
    rollupOptions: {
      output: {
        manualChunks: undefined
      }
    }
  }
});