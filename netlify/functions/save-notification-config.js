// netlify/functions/save-notification-config.js

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
  console.log('=== INICIO save-notification-config ===');
  
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  try {
    const { clientId, config } = JSON.parse(event.body);

    if (!clientId || !config) {
      console.log('Error: Faltan clientId o config');
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Faltan clientId o config' }),
      };
    }

    const db = admin.firestore();
    
    // Guardar la configuración en una subcolección específica del cliente
    await db.collection('clientes').doc(clientId)
      .collection('configuracion').doc('notificaciones')
      .set({
        ...config,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

    console.log(`Configuración de notificaciones guardada para cliente: ${clientId}`);

    return {
      statusCode: 200,
      body: JSON.stringify({ 
        message: 'Configuración de notificaciones guardada con éxito',
        clientId: clientId
      }),
    };
  } catch (error) {
    console.error('Error al guardar la configuración de notificaciones:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Error interno del servidor', details: error.message }),
    };
  }
};