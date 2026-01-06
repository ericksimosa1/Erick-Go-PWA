// netlify/functions/opt-out-reminder.cjs
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
  console.log('=== INICIO opt-out-reminder ===');
  
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  try {
    const { userId, clientId } = JSON.parse(event.body);

    if (!userId || !clientId) {
      console.log('Error: Faltan userId o clientId');
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Faltan userId o clientId' }),
      };
    }

    const db = admin.firestore();
    const today = new Date();
    
    // Guardar la marca de "opt-out" con la fecha de hoy en la suscripción del usuario
    await db.collection('suscripciones').doc(userId).set({
      dailyOptOut: true,
      dailyOptOutDate: admin.firestore.Timestamp.fromDate(today),
      clientId: clientId, // Aseguramos que el clientId esté presente
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    console.log(`Usuario ${userId} ha optado por no usar transporte hoy (${today.toDateString()}) para el cliente ${clientId}`);

    return {
      statusCode: 200,
      body: JSON.stringify({ 
        message: 'Opt-out registrado con éxito',
        userId: userId,
        clientId: clientId
      }),
    };
  } catch (error) {
    console.error('Error al registrar opt-out:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Error interno del servidor', details: error.message }),
    };
  }
};