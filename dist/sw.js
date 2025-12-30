// public/sw.js
// IMPORTANTE: CAMBIAR A V8 EN PUBLIC
const CACHE_NAME = 'erick-go-cache-v8';

const urlsToCache = [
  '/',
  '/erick-go-logo.png',
  '/manifest.json'
];

self.addEventListener('install', event => {
  console.log('[SW] Instalando Service Worker v8...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Cache abierto. Guardando archivos...');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('[SW] Archivos cacheados. Saltando espera para activación inmediata.');
        return self.skipWaiting();
      })
      .catch(error => {
        console.error('[SW] Error al abrir la caché:', error);
      })
  );
});

self.addEventListener('activate', event => {
  console.log('[SW] Activando Service Worker v8...');
  
  event.waitUntil(
    // Borra TODAS las cachés antiguas (v7, v6, v5...)
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
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', event => {
  const isDev = event.request.url.includes('localhost:5173') || 
                event.request.url.includes('127.0.0.1:5173') || 
                event.request.url.includes('.netlify/functions');

  if (isDev) {
    return; 
  }

  if (event.request.method === 'GET' && event.request.url.startsWith(self.location.origin)) {
    event.respondWith(
      caches.match(event.request)
        .then(response => {
          if (response) {
            return response;
          }
          return fetch(event.request).then(response => {
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
    return; 
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
      url: '/login',
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
    requireInteraction: true,
    actions: payload.actions || [], 
    tag: payload.tag || 'erick-go-notification',
    renotify: true,
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

  if (event.action === 'register_attendance') {
    console.log('[SW] Usuario quiere registrar asistencia.');
    event.waitUntil(self.clients.openWindow('/login'));
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

    if (self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1') {
      console.log('[SW] Modo desarrollo: Simulando opt-out.');
      event.waitUntil(self.clients.openWindow('/login'));
      return;
    }

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
            return self.clients.openWindow('/login');
        })
    );
    return;
  }
  
  let urlToOpen = event.notification.data.url || '/login';

  event.waitUntil(
    self.clients.matchAll({ 
      type: 'window', 
      includeUncontrolled: true 
    }).then(clientList => {
      for (const client of clientList) {
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlToOpen);
      }
    })
  );
});

// --- MANEJO DE MENSAJES DESDE LA APP (ACTUALIZACIÓN) ---
self.addEventListener('message', (event) => {
    console.log('[SW] Mensaje recibido de la app:', event.data);
    console.log('[SW] Tipo de dato recibido:', typeof event.data);
    
    if (event.data && event.data.type === 'SKIP_WAITING') {
        console.log('[SW] Comando SKIP_WAITING recibido. Saltando espera y activando nuevo SW...');
        self.skipWaiting();
    }
});