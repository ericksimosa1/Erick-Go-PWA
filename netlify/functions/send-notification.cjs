// netlify/functions/send-notification.cjs
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
        console.log('>>> [SUCCESS] Firebase Admin inicializado en send-notification (Clave Unificada).');
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

// Función para obtener suscripciones de usuarios desde Firestore
async function getUserSubscriptions(userIds, clientId = null) {
  try {
    const db = admin.firestore();
    const subscriptions = [];
    
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      console.log('getUserSubscriptions: La lista de userIds es inválida o está vacía.');
      return [];
    }

    let query = db.collection('suscripciones');
    
    if (clientId) {
      query = query.where('clientId', '==', clientId);
      const snapshot = await query.get();
      
      snapshot.forEach(doc => {
        const data = doc.data();
        if (userIds.includes(data.userId)) {
          subscriptions.push({
            userId: data.userId,
            subscription: data.subscription
          });
        }
      });
    } else {
      // Si no tenemos clientId, filtramos directamente por userIds
      const subscriptionPromises = userIds.map(async (userId) => {
        const doc = await db.collection('suscripciones').doc(userId).get();
        if (doc.exists) {
          return {
            userId: userId,
            subscription: doc.data().subscription
          };
        }
        return null;
      });

      const results = await Promise.all(subscriptionPromises);
      subscriptions.push(...results.filter(sub => sub !== null));
    }

    return subscriptions;

  } catch (error) {
    console.error('Error al obtener suscripciones:', error);
    return [];
  }
}

// ====================================================================
// HANDLER DE LA FUNCIÓN
// ====================================================================
exports.handler = async function (event, context) {
  console.log('=== INICIO send-notification (versión mejorada) ===');
  
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

    // --- CASO 1: Notificación manual desde el panel de admin ---
    if (payload && (userIds || userId)) {
      console.log('Detectado envío manual a usuarios.');
      let targetUserIds = Array.isArray(userIds) ? userIds : (userId ? [userId] : []);
      
      if (targetUserIds.length === 0) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'Falta el campo userId o userIds para la notificación manual.' }),
        };
      }

      // Obtenemos las suscripciones
      const subscriptions = await getUserSubscriptions(targetUserIds, clientId);
      
      if (subscriptions.length === 0) {
        console.log('No se encontraron suscripciones para los usuarios seleccionados.');
        return {
          statusCode: 200,
          body: JSON.stringify({ message: 'No hay suscripciones para notificar' })
        };
      }

      console.log(`Enviando notificación a ${subscriptions.length} suscripciones encontradas.`);
      
      // Procesamos las notificaciones en lotes para evitar sobrecarga
      const batchSize = 10;
      const results = [];
      
      for (let i = 0; i < subscriptions.length; i += batchSize) {
        const batch = subscriptions.slice(i, i + batchSize);
        const batchResults = await Promise.allSettled(
          batch.map(async ({ userId, subscription }) => {
            try {
              const payloadWithTimestamp = {
                ...payload,
                timestamp: Date.now()
              };
              
              await webPush.sendNotification(subscription, JSON.stringify(payloadWithTimestamp));
              console.log(`✅ Notificación enviada con éxito al usuario: ${userId}`);
              return { userId, success: true };
            } catch (error) {
              console.error(`❌ Error al enviar notificación al usuario ${userId}:`, error.message);
              
              // Si el error es 410 (Gone), significa que la suscripción ya no es válida
              if (error.statusCode === 410) {
                console.log(`Eliminando suscripción inválida para el usuario: ${userId}`);
                try {
                  const db = admin.firestore();
                  await db.collection('suscripciones').doc(userId).delete();
                } catch (deleteError) {
                  console.error(`Error al eliminar suscripción inválida: ${deleteError.message}`);
                }
              }
              
              return { userId, success: false, error: error.message };
            }
          })
        );
        
        results.push(...batchResults);
        
        // Pequeña pausa entre lotes
        if (i + batchSize < subscriptions.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      return {
        statusCode: 200,
        body: JSON.stringify({ 
          message: 'Proceso de notificación manual completado.',
          results: results
        }),
      };
    } 
    
    // --- CASO 2: Notificación automática ---
    else if (payload && subscription) {
      console.log('Detectado envío automático a una suscripción.');
      try {
        const payloadWithTimestamp = {
          ...payload,
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
    
    // --- CASO 3: Error, el formato de la petición es incorrecto ---
    else {
      console.error('Error: El formato de la petición no es válido.');
      return {
        statusCode: 400,
        body: JSON.stringify({ 
          error: 'Formato de petición inválido. Se requiere {userIds: [...], payload: {...}} o {subscription: {...}, payload: {...}}.' 
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