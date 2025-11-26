// netlify/functions/send-notification.js

const webPush = require('web-push');
const admin = require('firebase-admin');

// Configurar claves VAPID
webPush.setVapidDetails(
  'mailto:erickgoapp@gmail.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// Inicializar Firebase Admin si no está inicializado
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        project_id: process.env.FIREBASE_PROJECT_ID,
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
        private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
      }),
      databaseURL: `https://${process.env.FIREBASE_PROJECT_ID}.firebaseio.com`
    });
    console.log('Firebase Admin inicializado correctamente.');
  } catch (error) {
    console.error('Error al inicializar Firebase Admin:', error);
  }
}

// Función para obtener suscripciones de usuarios desde Firestore
async function getUserSubscriptions(userIds, clientId = null) {
  try {
    const db = admin.firestore();
    const subscriptions = [];
    
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      console.log('getUserSubscriptions: La lista de userIds es inválida o está vacía.');
      return [];
    }

    // MEJORA CLAVE: Creamos una consulta más eficiente si tenemos un clientId
    let query = db.collection('suscripciones');
    
    if (clientId) {
      // Si tenemos un clientId, primero filtramos por clientId y luego por userIds
      query = query.where('clientId', '==', clientId);
      const snapshot = await query.get();
      
      // Filtramos los resultados para obtener solo los userIds que necesitamos
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

      // Obtenemos las suscripciones filtrando por clientId si está disponible
      const subscriptions = await getUserSubscriptions(targetUserIds, clientId);
      
      if (subscriptions.length === 0) {
        console.log('No se encontraron suscripciones para los usuarios seleccionados.');
        return {
          statusCode: 200,
          body: JSON.stringify({ message: 'No hay suscripciones para notificar' }),
        };
      }

      console.log(`Enviando notificación a ${subscriptions.length} suscripciones encontradas.`);
      
      // MEJORA CLAVE: Procesamos las notificaciones en lotes para mejorar el rendimiento
      const batchSize = 10; // Procesamos en lotes de 10 para evitar sobrecarga
      const results = [];
      
      for (let i = 0; i < subscriptions.length; i += batchSize) {
        const batch = subscriptions.slice(i, i + batchSize);
        const batchResults = await Promise.allSettled(
          batch.map(async ({ userId, subscription }) => {
            try {
              // MEJORA: Añadimos un timestamp para asegurar que la notificación se procese rápidamente
              const payloadWithTimestamp = {
                ...payload,
                timestamp: Date.now()
              };
              
              await webPush.sendNotification(subscription, JSON.stringify(payloadWithTimestamp));
              console.log(`✅ Notificación enviada con éxito al usuario: ${userId}`);
              return { userId, success: true };
            } catch (error) {
              console.error(`❌ Error al enviar notificación al usuario ${userId}:`, error.message);
              
              // MEJORA CLAVE: Si el error es 410 (Gone), significa que la suscripción ya no es válida
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
        
        // Pequeña pausa entre lotes para evitar sobrecargar el servicio
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