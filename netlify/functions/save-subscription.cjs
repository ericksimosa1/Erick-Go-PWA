// netlify/functions/save-subscription.cjs
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
  console.log('=== INICIO save-subscription (versión mejorada) ===');
  
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  try {
    const { userId, subscription, clientId } = JSON.parse(event.body);

    if (!userId || !subscription) {
      console.log('Error: Faltan userId o subscription');
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Faltan userId o subscription' }),
      };
    }

    const db = admin.firestore();
    
    // CAMBIO CLAVE: Ahora guardamos el clientId para asegurar que las notificaciones
    // se envíen a los usuarios correctos dentro de su empresa.
    await db.collection('suscripciones').doc(userId).set({
      userId: userId,
      clientId: clientId || null, 
      subscription: subscription,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    console.log(`Suscripción guardada para usuario: ${userId}, cliente: ${clientId}`);

    return {
      statusCode: 200,
      body: JSON.stringify({ 
        message: 'Suscripción guardada con éxito',
        userId: userId,
        clientId: clientId
      }),
    };
  } catch (error) {
    console.error('Error al guardar la suscripción:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Error interno del servidor', details: error.message }),
    };
  }
};