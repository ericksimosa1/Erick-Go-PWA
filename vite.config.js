// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Necesario para obtener la ruta correcta en ES Modules
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- NUESTRO PLUGIN PERSONALIZADO PARA COPIAR EL SW ---
// Esta función crea un pequeño "programa" que Vite ejecutará al terminar
function copySWPlugin() {
  return {
    name: 'copy-service-worker',
    // 'writeBundle' se ejecuta justo después de que se generan los archivos en dist/
    writeBundle() {
      try {
        const swSource = path.resolve(__dirname, 'public/sw.js');
        const swDest = path.resolve(__dirname, 'dist/sw.js');
        
        // Verificamos que el archivo origen exista antes de copiar
        if (fs.existsSync(swSource)) {
          fs.copyFileSync(swSource, swDest);
          console.log('✅ [Vite Plugin] Service Worker copiado exitosamente de public/ a dist/');
        } else {
          console.error('❌ [Vite Plugin] No se encontró public/sw.js');
        }
      } catch (error) {
        console.error('❌ [Vite Plugin] Error al copiar Service Worker:', error);
      }
    }
  };
}
// --- FIN DEL PLUGIN PERSONALIZADO ---

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    copySWPlugin() // <--- Añadimos nuestro plugin aquí
  ],
  
  // --- CONFIGURACIÓN DEL SERVIDOR (Tuya) ---
  server: {
    host: '0.0.0.0',
    proxy: {
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