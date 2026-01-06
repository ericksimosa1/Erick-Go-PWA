// netlify/functions/get-notification-config.cjs
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

// ====================================================================
// CONFIGURACIONES POR DEFECTO ESPECÍFICAS
// ====================================================================
const DEFAULT_CONFIGS = {
  'irjKu853x42zZc1hcRW6': { // Croii Soledad
    enableNotifications: true,
    enableAttendanceReminder: true,
    attendanceReminderStartTime: { time: '02:00', ampm: 'PM' }, 
    attendanceReminderEndTime: { time: '10:30', ampm: 'PM' },   
    attendanceReminderFrequency: 5,
    enableClosingReminder: true,
    closingReminderTime: { time: '06:00', ampm: 'PM' },
    enableTripNotifications: true,
  },
  'yAPjLzpN1bRyX5k5ljhZ': { // Croii Aviadores
    enableNotifications: true,
    enableAttendanceReminder: true,
    attendanceReminderStartTime: { time: '12:00', ampm: 'PM' }, 
    attendanceReminderEndTime: { time: '08:00', ampm: 'PM' },   
    attendanceReminderFrequency: 5,
    enableClosingReminder: true,
    closingReminderTime: { time: '08:00', ampm: 'PM' },
    enableTripNotifications: true,
  }
};

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
      console.log(`Configuración de notificaciones cargada para cliente: ${clientId}`);
    } else {
      // Si no hay configuración en el backend, usar la configuración por defecto específica de la empresa
      if (DEFAULT_CONFIGS[clientId]) {
        config = DEFAULT_CONFIGS[clientId];
        console.log(`Usando configuración por defecto para ${clientId}:`, DEFAULT_CONFIGS[clientId]);
      } else {
         // Fallback si el cliente no está en el default
         config = {
            enableNotifications: true,
            enableAttendanceReminder: true,
            attendanceReminderStartTime: { time: '07:00', ampm: 'AM' },
            attendanceReminderEndTime: { time: '10:30', ampm: 'PM' },
            attendanceReminderFrequency: 30,
            enableClosingReminder: true,
            closingReminderTime: { time: '06:00', ampm: 'PM' },
            enableTripNotifications: true,
         };
      }
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
    console.error('Error al obtener configuración de notificaciones:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Error interno del servidor', details: error.message }),
    };
  }
};