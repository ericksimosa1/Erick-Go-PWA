// public/sw.js

const CACHE_NAME = 'erick-go-cache-v5';
const urlsToCache = [
  '/',
  '/erick-go-logo.png',
  '/manifest.json'
];

self.addEventListener('install', event => {
  console.log('Service Worker: Instalando...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Cache abierto y archivos guardados');
        return cache.addAll(urlsToCache);
      })
      .catch(error => {
        console.error('Error al abrir la caché:', error);
      })
  );
});

self.addEventListener('activate', event => {
  console.log('Service Worker: Activando...');
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Service Worker: Eliminando caché antigua:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

self.addEventListener('fetch', event => {
  // NO INTERCEPTAR PETICIONES A FUNCIONES DE NETLIFY EN MODO DESARROLLO
  if (event.request.url.includes('localhost:5173') || 
      event.request.url.includes('.netlify/functions')) {
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
  console.log('Service Worker: Notificación push recibida.', event);

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
      console.error('Service Worker: Error al parsear el payload de la notificación:', e);
    }
  }

  const options = {
    body: payload.body,
    icon: payload.icon,
    badge: payload.badge,
    vibrate: [100, 50, 100],
    data: payload.data,
    requireInteraction: true,
    actions: payload.actions || [], // Usamos las acciones si vienen en el payload
    tag: payload.tag || 'erick-go-notification',
    renotify: true,
    silent: false,
  };

  event.waitUntil(
    self.registration.showNotification(payload.title, options)
  );
});

// --- NUEVA LÓGICA PARA MANEJO DE CLICS EN NOTIFICACIONES ---
self.addEventListener('notificationclick', event => {
  console.log('Service Worker: Notificación clickeada.', event);
  
  event.notification.close();

  // MANEJO DE ACCIONES INTERACTIVAS
  if (event.action === 'register_attendance') {
    console.log('Usuario quiere registrar asistencia.');
    event.waitUntil(
      clients.openWindow('/login')
    );
    return;
  }

  if (event.action === 'opt_out_transport') {
    console.log('Usuario ha optado por no usar transporte hoy.');
    
    const userId = event.notification.data.userId;
    const clientId = event.notification.data.clientId;

    if (!userId || !clientId) {
        console.error('Faltan userId o clientId en los datos de la notificación para opt-out.');
        event.waitUntil(clients.openWindow('/login'));
        return;
    }

    // EN MODO DESARROLLO, SIMULAMOS LA LLAMADA A LA FUNCIÓN
    if (self.location.hostname === 'localhost') {
      console.log('Modo desarrollo: Simulando opt-out para userId:', userId, 'clientId:', clientId);
      event.waitUntil(
        clients.openWindow('/login')
      );
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
                throw new Error('Error al registrar opt-out en el servidor.');
            }
            console.log('Opt-out registrado exitosamente.');
            return self.registration.showNotification('¡Entendido!', {
                body: 'No recibirás más recordatorios de transporte hoy.',
                icon: '/erick-go-logo.png',
                tag: 'opt-out-confirmation'
            });
        })
        .catch(error => {
            console.error('Error al hacer fetch a opt-out-reminder:', error);
        })
        .finally(() => {
            return clients.openWindow('/login');
        })
    );
    return;
  }
  
  // MANEJO DE CLICS NORMALES (cuando no hay acciones)
  let urlToOpen = event.notification.data.url || '/login';

  event.waitUntil(
    clients.matchAll({ 
      type: 'window', 
      includeUncontrolled: true 
    }).then(clientList => {
      for (const client of clientList) {
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});