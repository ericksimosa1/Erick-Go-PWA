// netlify/functions/send-attendance-reminder.js

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
    console.log('Firebase Admin inicializado correctamente');
  } catch (error) {
    console.error('Error al inicializar Firebase Admin:', error);
  }
}

// Función para obtener la configuración de notificaciones de un cliente
async function getNotificationConfig(clientId) {
  try {
    const db = admin.firestore();
    const doc = await db.collection('clientes').doc(clientId)
      .collection('configuracion').doc('notificaciones')
      .get();
    
    if (doc.exists) {
      return doc.data();
    }
    
    // Configuración por defecto si no existe
    return {
      enableNotifications: true,
      enableAttendanceReminder: true,
      attendanceReminderFrequency: 30,
      attendanceReminderStartTime: '07:00',
      attendanceReminderEndTime: '10:00',
      enableClosingReminder: true,
      closingReminderTime: '18:00',
      enableTripNotifications: true,
      batchSize: 10,
      retryAttempts: 3
    };
  } catch (error) {
    console.error('Error al obtener configuración de notificaciones:', error);
    return null;
  }
}

// Función para obtener empleados sin registrar asistencia hoy y que no han optado por salir
async function getEmployeesNeedingReminder(clientId) {
  try {
    const db = admin.firestore();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    
    // 1. Obtener todos los usuarios de tipo empleado para este cliente
    const vinculosSnapshot = await db.collection('vinculos')
      .where('clientId', '==', clientId)
      .where('rol', '==', 'empleado')
      .where('activo', '==', true)
      .get();
    
    const employeeIds = vinculosSnapshot.docs.map(doc => doc.data().userId);
    
    if (employeeIds.length === 0) {
      return [];
    }
    
    // 2. Obtener las asistencias de hoy
    const asistenciasSnapshot = await db.collection('asistencias')
      .where('clientId', '==', clientId)
      .where('fecha', '>=', admin.firestore.Timestamp.fromDate(today))
      .where('fecha', '<', admin.firestore.Timestamp.fromDate(tomorrow))
      .get();
    
    const employeeIdsWithAttendance = new Set();
    asistenciasSnapshot.docs.forEach(doc => {
      employeeIdsWithAttendance.add(doc.data().empleadoId);
    });
    
    // 3. Obtener las suscripciones para ver quién ha optado por salir hoy
    const subscriptionsSnapshot = await db.collection('suscripciones')
      .where('clientId', '==', clientId)
      .get();
    
    const optedOutUserIds = new Set();
    subscriptionsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      // Comprobamos si ha optado por salir hoy y si la fecha de opt-out es hoy
      if (data.dailyOptOut && data.dailyOptOutDate) {
        const optOutDate = data.dailyOptOutDate.toDate();
        if (optOutDate.toDateString() === today.toDateString()) {
          optedOutUserIds.add(doc.id);
        }
      }
    });
    
    // 4. Filtrar empleados que no tienen asistencia y no han optado por salir
    const employeesNeedingReminder = employeeIds.filter(id => 
      !employeeIdsWithAttendance.has(id) && !optedOutUserIds.has(id)
    );
    
    return employeesNeedingReminder;
  } catch (error) {
    console.error('Error al obtener empleados que necesitan recordatorio:', error);
    return [];
  }
}

// Función para enviar notificaciones a usuarios (CORREGIDA)
async function sendNotificationsToUsers(userIds, payload, clientId) {
  try {
    if (!userIds || userIds.length === 0) {
      return { success: true, message: 'No hay usuarios a quienes notificar' };
    }
    
    const db = admin.firestore();
    const results = [];
    
    // CAMBIO CLAVE: Ahora enviamos las notificaciones de una en una para poder personalizar los datos
    for (const userId of userIds) {
      const doc = await db.collection('suscripciones').doc(userId).get();
      if (!doc.exists) {
        console.log(`No se encontró suscripción para el usuario: ${userId}`);
        results.push({ userId, success: false, error: 'Suscripción no encontrada' });
        continue;
      }

      const subscription = doc.data().subscription;
      
      // Creamos un payload personalizado para cada usuario
      const personalizedPayload = {
        ...payload,
        data: {
          ...payload.data,
          userId: userId, // ID del usuario específico
          clientId: clientId // ID de la empresa
        }
      };

      try {
        await webPush.sendNotification(subscription, JSON.stringify(personalizedPayload));
        console.log(`✅ Recordatorio interactivo enviado con éxito al usuario: ${userId}`);
        results.push({ userId, success: true });
      } catch (error) {
        console.error(`❌ Error al enviar recordatorio interactivo al usuario ${userId}:`, error.message);
        
        if (error.statusCode === 410) {
          console.log(`Eliminando suscripción inválida para el usuario: ${userId}`);
          try {
            await db.collection('suscripciones').doc(userId).delete();
          } catch (deleteError) {
            console.error(`Error al eliminar suscripción inválida: ${deleteError.message}`);
          }
        }
      
        results.push({ userId, success: false, error: error.message });
      }
      
      // Pequeña pausa entre notificaciones para no sobrecargar el servicio
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return { success: true, results };
  } catch (error) {
    console.error('Error al enviar recordatorios:', error);
    return { success: false, error: error.message };
  }
}

// Función para verificar si la hora actual está dentro del rango de recordatorios
function isWithinReminderRange(startTime, endTime) {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  
  const startMinutes = parseInt(startTime.split(':')[0]) * 60 + parseInt(startTime.split(':')[1]);
  const endMinutes = parseInt(endTime.split(':')[0]) * 60 + parseInt(endTime.split(':')[1]);
  
  return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
}

exports.handler = async function (event, context) {
  console.log('=== INICIO send-attendance-reminder (versión interactiva) ===');
  
  try {
    const db = admin.firestore();
    const clientsSnapshot = await db.collection('clientes').get();
    
    if (clientsSnapshot.empty) {
      return { 
        statusCode: 200, 
        body: JSON.stringify({ message: 'No hay clientes activos.' }) 
      };
    }
    
    const results = [];
    
    for (const clientDoc of clientsSnapshot.docs) {
      const clientId = clientDoc.id;
      const clientName = clientDoc.data().nombre;
      
      console.log(`Procesando cliente: ${clientName} (${clientId})`);
      
      const config = await getNotificationConfig(clientId);
      
      if (!config || !config.enableNotifications || !config.enableAttendanceReminder) {
        console.log(`Recordatorios de asistencia desactivados para el cliente: ${clientName}`);
        continue;
      }

      if (!isWithinReminderRange(config.attendanceReminderStartTime, config.attendanceReminderEndTime)) {
        console.log(`Fuera del rango horario de recordatorios para: ${clientName}`);
        continue;
      }
      
      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      
      const frequencyInMinutes = config.attendanceReminderFrequency || 30;
      if (currentMinutes % frequencyInMinutes !== 0) {
        console.log(`No es hora de enviar recordatorio para: ${clientName} (frecuencia: ${frequencyInMinutes} min)`);
        continue;
      }
      
      console.log(`Enviando recordatorio de asistencia para: ${clientName}`);
      
      const employeesNeedingReminder = await getEmployeesNeedingReminder(clientId);
      
      if (employeesNeedingReminder.length > 0) {
        const payload = {
          title: '¡Recordatorio de Asistencia!',
          body: 'Aún no has registrado tu asistencia ni zona de destino para hoy.',
          icon: '/erick-go-logo.png',
          tag: 'attendance-reminder',
          renotify: true,
          requireInteraction: true,
          actions: [
            {
              action: 'register_attendance',
              title: 'Registrar Asistencia'
            },
            {
              action: 'opt_out_transport',
              title: 'No Usar Transporte Hoy'
            }
          ],
          data: {
            url: '/login',
            type: 'attendance_reminder'
          }
        };
        
        const result = await sendNotificationsToUsers(employeesNeedingReminder, payload, clientId);
        results.push({
          clientId,
          clientName,
          type: 'attendance_reminder_interactive',
          recipients: employeesNeedingReminder.length,
          result
        });
      } else {
        console.log(`Todos los empleados han registrado asistencia o han optado por salir para: ${clientName}`);
      }
    }
    
    return {
      statusCode: 200,
      body: JSON.stringify({ 
        message: 'Proceso de recordatorios interactivos completado.',
        results: results
      }),
    };
  } catch (error) {
    console.error('Error en la función de recordatorio interactivo:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Error interno del servidor', details: error.message }),
    };
  }
};