// netlify/functions/get-notification-config.js

const admin = require('firebase-admin');

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
    console.log('Firebase Admin inicializado correctamente');
  } catch (error) {
    console.error('Error al inicializar Firebase Admin:', error);
  }
}

exports.handler = async function (event, context) {
  console.log('=== INICIO get-notification-config ===');
  
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  try {
    const clientId = event.queryStringParameters.clientId;

    if (!clientId) {
      console.log('Error: Falta clientId');
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Falta el parámetro clientId' }),
      };
    }

    const db = admin.firestore();
    
    // Obtener la configuración de la subcolección del cliente
    const doc = await db.collection('clientes').doc(clientId)
      .collection('configuracion').doc('notificaciones')
      .get();

    let config = {};
    
    if (doc.exists) {
      config = doc.data();
      console.log(`Configuración de notificaciones encontrada para cliente: ${clientId}`);
    } else {
      console.log(`No se encontró configuración de notificaciones para cliente: ${clientId}. Se devolverá una configuración por defecto.`);
      // Devolvemos una configuración por defecto si no existe una personalizada
      config = {
        enableNotifications: true,
        enableAttendanceReminder: true, // <-- CORRECCIÓN: Asegurar que sea true por defecto
        attendanceReminderStartTime: '09:00', // <-- CORRECCIÓN: Formato 24h
        attendanceReminderEndTime: '22:00',   // <-- CORRECCIÓN: Formato 24h
        attendanceReminderFrequency: 30,
        enableClosingReminder: true,
        closingReminderTime: '18:00', // <-- CORRECCIÓN: Formato 24h
        enableTripNotifications: true,
        batchSize: 10,
        retryAttempts: 3
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ 
        message: 'Configuración de notificaciones obtenida con éxito',
        clientId: clientId,
        config: config
      }),
    };
  } catch (error) {
    console.error('Error al obtener la configuración de notificaciones:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Error interno del servidor', details: error.message }),
    };
  }
};