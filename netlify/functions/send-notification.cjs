// netlify/functions/send-notification.cjs (CORREGIDO: Sin error de índice)
const webPush = require('web-push');
const admin = require('firebase-admin');

// ====================================================================
// INICIALIZACIÓN (CLAVE DIVIDIDA)
// ====================================================================
const getFullServiceAccount = () => {
    const part1 = process.env.FIREBASE_KEY_PART_1 || '';
    const part2 = process.env.FIREBASE_KEY_PART_2 || '';
    const part3 = process.env.FIREBASE_KEY_PART_3 || '';

    if (part1 && part2 && part3) {
        return `${part1}${part2}${part3}`;
    }
    return process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
};

// Inicializar Firebase Admin si no está inicializado
if (!admin.apps.length) {
    try {
        const serviceAccountKey = getFullServiceAccount();
        const serviceAccount = JSON.parse(serviceAccountKey);
        
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: `https://${process.env.FIREBASE_PROJECT_ID}.firebaseio.com`
        });
        console.log('>>> [SUCCESS] Firebase Admin inicializado (Clave Unificada).');
    } catch (error) {
        console.error('>>> [ERROR] Error al inicializar Firebase Admin:', error);
        throw new Error("Configuración faltante");
    }
}

// Configurar claves VAPID
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webPush.setVapidDetails(
        'mailto:erickgoapp@gmail.com',
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
    );
}

// ====================================================================
// FUNCIONES AUXILIARES
// ====================================================================
function chunkArray(array, chunkSize) {
    const results = [];
    const copy = [...array];
    while (copy.length) {
        results.push(copy.splice(0, chunkSize));
    }
    return results;
}

// ====================================================================
// HANDLER DE LA FUNCIÓN
// ====================================================================
exports.handler = async function (event, context) {
  console.log('=== INICIO send-notification (Versión sin error de índice) ===');
  
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  try {
    const requestBody = JSON.parse(event.body);
    console.log('Cuerpo de la petición recibido:', JSON.stringify(requestBody, null, 2));

    const { userIds, userId, subscription, payload, clientId } = requestBody;

    // --- CASO 1: Notificación manual o masiva ---
    if (payload && (userIds || userId)) {
      console.log('Detectado envío masivo. Target ClientID:', clientId);
      let targetUserIds = Array.isArray(userIds) ? userIds : (userId ? [userId] : []);
      
      if (targetUserIds.length === 0) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'Falta el campo userId o userIds para la notificación manual.' }),
        };
      }

      const db = admin.firestore();
      let subscriptions = [];

      // 1. OBTENER USUARIOS Y SEPARAR ROLES
      const adminIds = [];
      const otherIds = []; 
      
      const userIdChunks = chunkArray([...targetUserIds], 10);
      console.log(`Verificando roles de ${targetUserIds.length} usuarios...`);

      for (const chunk of userIdChunks) {
        try {
            const usersSnapshot = await db.collection('usuarios')
                .where(admin.firestore.FieldPath.documentId(), 'in', chunk)
                .get();

            usersSnapshot.forEach(doc => {
                const userData = doc.data();
                if (userData.rol === 'administrador') {
                    adminIds.push(doc.id);
                } else {
                    otherIds.push(doc.id);
                }
            });
        } catch (err) {
            console.error(`Error verificando roles en chunk:`, err);
        }
      }

      console.log(`Roles identificados: ${adminIds.length} Admins, ${otherIds.length} Conductores/Empleados.`);

      // 2. PROCESAR ADMINISTRADORES (Bypass Total)
      if (adminIds.length > 0) {
            console.log('Buscando suscripciones de administradores (sin filtro de empresa)...');
            const adminSubPromises = adminIds.map(uid => db.collection('suscripciones').doc(uid).get());
            const adminSubDocs = await Promise.all(adminSubPromises);
            
            adminSubDocs.forEach(doc => {
                if (doc.exists) {
                    subscriptions.push({
                        userId: doc.id,
                        subscription: doc.data().subscription
                    });
                }
            });
      }

      // 3. PROCESAR CONDUCTORES Y EMPLEADOS (Validación por Vínculos)
      if (otherIds.length > 0 && clientId) {
            console.log('Verificando vínculos para la empresa:', clientId);
            
            // CORRECCIÓN CRÍTICA: Filtramos solo por clientId para evitar error de índice compuesto
            const vinculosSnapshot = await db.collection('vinculos')
                .where('clientId', '==', clientId)
                .get();

            console.log(`Se encontraron ${vinculosSnapshot.size} vínculos (incluyendo inactivos).`);

            const validUserIds = new Set();
            
            vinculosSnapshot.forEach(doc => {
                const data = doc.data();
                // Verificamos activo en MEMORIA (JavaScript) en lugar de en la Query (Firestore)
                if (data.activo !== false && otherIds.includes(data.userId)) {
                    validUserIds.add(data.userId);
                }
            });

            const usersToNotify = Array.from(validUserIds);
            console.log(`Usuarios válidos y activos encontrados: ${usersToNotify.length}`);

            if (usersToNotify.length > 0) {
                const validUserChunks = chunkArray(usersToNotify, 10);
                
                for (const chunk of validUserChunks) {
                    const subSnapshot = await db.collection('suscripciones')
                        .where(admin.firestore.FieldPath.documentId(), 'in', chunk)
                        .get();

                    subSnapshot.forEach(doc => {
                        if (doc.exists) {
                            subscriptions.push({
                                userId: doc.id,
                                subscription: doc.data().subscription
                            });
                        }
                    });
                }
            }
      }

      // 4. ENVIAR NOTIFICACIONES
      if (subscriptions.length === 0) {
        console.log('No se encontraron suscripciones coincidentes.');
        return {
          statusCode: 200,
          body: JSON.stringify({ message: 'No hay suscripciones para notificar' })
        };
      }

      console.log(`Enviando notificación a ${subscriptions.length} suscripciones.`);
      
      const batchSize = 10;
      const results = [];
      
      for (let i = 0; i < subscriptions.length; i += batchSize) {
        const batch = subscriptions.slice(i, i + batchSize);
        const batchResults = await Promise.allSettled(
          batch.map(async ({ userId, subscription }) => {
            try {
              // CORRECCIÓN: Inyectamos el badge si no viene en el payload
              const payloadWithTimestamp = {
                ...payload,
                badge: payload.badge || '/icons/badge-icon.png',
                timestamp: Date.now()
              };
              
              await webPush.sendNotification(subscription, JSON.stringify(payloadWithTimestamp));
              console.log(`✅ Notificación enviada a: ${userId}`);
              return { userId, success: true };
            } catch (error) {
              console.error(`❌ Error enviando a ${userId}:`, error.message);
              
              if (error.statusCode === 410) {
                try {
                  await db.collection('suscripciones').doc(userId).delete();
                } catch (deleteError) {}
              }
              
              return { userId, success: false, error: error.message };
            }
          })
        );
        
        results.push(...batchResults);
        if (i + batchSize < subscriptions.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      return {
        statusCode: 200,
        body: JSON.stringify({ 
          message: 'Proceso completado.',
          results: results
        }),
      };
    } 
    
    // --- CASO 2: Notificación automática ---
    else if (payload && subscription) {
      console.log('Detectado envío automático a una suscripción.');
      try {
        // CORRECCIÓN: Inyectamos el badge si no viene en el payload
        const payloadWithTimestamp = {
          ...payload,
          badge: payload.badge || '/icons/badge-icon.png',
          timestamp: Date.now()
        };
        
        await webPush.sendNotification(subscription, JSON.stringify(payloadWithTimestamp));
        console.log('✅ Notificación automática enviada con éxito.');
        return {
          statusCode: 200,
          body: JSON.stringify({ message: 'Notificación automática enviada con éxito.' }),
        };
      } catch (error) {
        console.error('❌ Error al enviar notificación automática:', error.message);
        return {
          statusCode: 500,
          body: JSON.stringify({ error: 'Error al enviar notificación automática.', details: error.message }),
        };
      }
    } 
    
    // --- CASO 3: Error ---
    else {
      console.error('Error: El formato de la petición no es válido.');
      return {
        statusCode: 400,
        body: JSON.stringify({ 
          error: 'Formato de petición inválido.' 
        }),
      };
    }

  } catch (error) {
    console.error('Error general en la función send-notification:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Error interno del servidor', details: error.message }),
    };
  }
};