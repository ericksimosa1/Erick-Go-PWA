// public/sw.js
// IMPORTANTE: CAMBIA ESTE NÚMERO (v6, v7, v8...) EN CADA ACTUALIZACIÓN IMPORTANTE
// Esto "romperá" la caché vieja de los móviles y forzará la descarga del nuevo código.
const CACHE_NAME = 'erick-go-cache-v7';

const urlsToCache = [
  '/',
  '/erick-go-logo.png',
  '/manifest.json'
];

self.addEventListener('install', event => {
  console.log('[SW] Instalando Service Worker...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Cache abierto. Guardando archivos...');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('[SW] Archivos cacheados. Saltando espera para activación inmediata.');
        // Esto fuerza al SW a convertirse en el controlador activo inmediatamente
        return self.skipWaiting();
      })
      .catch(error => {
        console.error('[SW] Error al abrir la caché:', error);
      })
  );
});

self.addEventListener('activate', event => {
  console.log('[SW] Activando Service Worker nuevo...');
  
  event.waitUntil(
    // Borra TODAS las cachés antiguas de Erick Go para evitar datos corruptos o estancados
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log(`[SW] Eliminando caché antigua: ${cacheName}`);
            return caches.delete(cacheName);
          }
          return Promise.resolve();
        })
      );
    }).then(() => {
      console.log('[SW] Cachés antiguas limpiadas. Reclamando clientes...');
      // Esto asegura que la nueva PWA controle todas las pestañas abiertas inmediatamente
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', event => {
  // NO INTERCEPTAR PETICIONES A FUNCIONES DE NETLIFY EN MODO DESARROLLO
  // (Para evitar errores al conectar a Netlify Local)
  const isDev = event.request.url.includes('localhost:5173') || 
                event.request.url.includes('127.0.0.1:5173') || // VSCode Live Server
                event.request.url.includes('.netlify/functions'); // Llamadas API

  if (isDev) {
    return; // Dejar pasar en desarrollo
  }

  // Estrategia Network First con Fallback a Caché para recursos estáticos
  if (event.request.method === 'GET' && event.request.url.startsWith(self.location.origin)) {
    event.respondWith(
      caches.match(event.request)
        .then(response => {
          if (response) {
            return response;
          }
          return fetch(event.request).then(response => {
            // Si la respuesta no es válida o es un error, no la guardes en caché
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            const responseToCache = response.clone();
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });
            return response;
          });
        })
    );
  } else {
    return; // Para peticiones POST o externas, dejarlas fluir
  }
});

// --- LÓGICA DE NOTIFICACIONES PUSH ---
self.addEventListener('push', event => {
  console.log('[SW] Notificación push recibida.', event);

  let payload = {
    title: 'Erick Go PWA',
    body: 'Tienes una nueva notificación.',
    icon: '/erick-go-logo.png',
    badge: '/erick-go-logo.png',
    data: {
      url: '/login', // URL por defecto si la notificación no trae una
      primaryKey: 1
    }
  };

  if (event.data) {
    try {
      const dataFromServer = event.data.json();
      payload = { ...payload, ...dataFromServer };
    } catch (e) {
      console.error('[SW] Error al parsear el payload de la notificación:', e);
    }
  }

  const options = {
    body: payload.body,
    icon: payload.icon,
    badge: payload.badge,
    vibrate: [100, 50, 100],
    data: payload.data,
    requireInteraction: true, // Requiere interacción para abrir app
    actions: payload.actions || [], // Botones de acción (si los hay)
    tag: payload.tag || 'erick-go-notification',
    renotify: true, // Si llega una nueva, reemplaza a la anterior
    silent: false,
  };

  event.waitUntil(
    self.registration.showNotification(payload.title, options)
  );
});

// --- MANEJO DE CLICKS EN NOTIFICACIONES ---
self.addEventListener('notificationclick', event => {
  console.log('[SW] Notificación clickeada.', event);  
  event.notification.close();

  // MANEJO DE ACCIONES DEFINIDAS (si agregaste botones en la notificación del servidor)
  if (event.action === 'register_attendance') {
    console.log('[SW] Usuario quiere registrar asistencia.');
    event.waitUntil(self.clients.openWindow('/login')); // Abre la app principal
    return;
  }

  if (event.action === 'opt_out_transport') {
    console.log('[SW] Usuario ha optado por no usar transporte hoy.');
    const userId = event.notification.data.userId;
    const clientId = event.notification.data.clientId;

    if (!userId || !clientId) {
        console.error('[SW] Faltan userId o clientId en los datos de la notificación para opt-out.');
        event.waitUntil(self.clients.openWindow('/login'));
        return;
    }

    // Si estamos en desarrollo, solo abrimos la ventana sin llamar a la función
    if (self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1') {
      console.log('[SW] Modo desarrollo: Simulando opt-out.');
      event.waitUntil(self.clients.openWindow('/login'));
      return;
    }

    // Llamada a la función de Netlify para recordatorio
    event.waitUntil(
        fetch('/.netlify/functions/opt-out-reminder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: userId, clientId: clientId }),
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('[SW] Error al registrar opt-out en el servidor.');
            }
            console.log('[SW] Opt-out registrado exitosamente.');
            // Mostrar un mensaje de confirmación al usuario
            return self.registration.showNotification('¡Entendido!', {
                body: 'No recibirás más recordatorios de transporte hoy.',
                icon: '/erick-go-logo.png',
                tag: 'opt-out-confirmation'
            });
        })
        .catch(error => {
            console.error('[SW] Error al hacer fetch a opt-out-reminder:', error);
        })
        .finally(() => {
            // Siempre redirigir al login al final
            return self.clients.openWindow('/login');
        })
    );
    return;
  }
  
  // Si no hay acción específica, abrir la URL definida en la notificación o el login
  let urlToOpen = event.notification.data.url || '/login';

  event.waitUntil(
    self.clients.matchAll({ 
      type: 'window', 
      includeUncontrolled: true 
    }).then(clientList => {
      // Intentar enfocar la ventana actual primero
      for (const client of clientList) {
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      // Si no se encontró, abrir una nueva
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlToOpen);
      }
    })
  );
});

// --- MANEJO DE MENSAJES DESDE LA APP (ACTUALIZACIÓN) ---
// Este bloque es CRUCIAL para que funcione el botón "ACTUALIZAR"
self.addEventListener('message', (event) => {
  console.log('[SW] Mensaje recibido de la app:', event.data);
  
  // Si recibimos el comando 'SKIP_WAITING', obligamos al SW nuevo a activarse inmediatamente
  if (event.data === 'SKIP_WAITING') {
    console.log('[SW] Comando SKIP_WAITING recibido. Activando nuevo SW...');
    self.skipWaiting();
  }
});