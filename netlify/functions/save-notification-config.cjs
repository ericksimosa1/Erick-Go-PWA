// netlify/functions/save-notification-config.cjs
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