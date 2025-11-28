// netlify/functions/send-attendance-reminder.js (VERSIÓN FINAL CORREGIDA)

const webPush = require('web-push');
const admin = require('firebase-admin');

// Verificar configuración de VAPID
if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
  console.error('[DEBUG] Las claves VAPID no están configuradas en las variables de entorno');
}

// Verificar configuración de Firebase
if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
  console.error('[DEBUG] Las credenciales de Firebase no están configuradas en las variables de entorno');
}

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

// --- FUNCIÓN CORREGIDA: Ahora busca en el lugar correcto y maneja el nuevo formato de hora ---
async function getNotificationConfig(clientId) {
  console.log(`[DEBUG] getNotificationConfig llamado para clientId: ${clientId}`);
  try {
    const db = admin.firestore();
    const notificacionesDoc = await db.collection('clientes').doc(clientId)
      .collection('configuracion').doc('notificaciones')
      .get();
    
    if (notificacionesDoc.exists) {
      const config = notificacionesDoc.data();
      console.log(`[DEBUG] Configuración encontrada para ${clientId}:`, config);
      return config;
    }
    
    console.log(`[DEBUG] No se encontró configuración para ${clientId}. Usando configuración por defecto.`);
    return {
      enableNotifications: true,
      enableAttendanceReminder: true,
      attendanceReminderFrequency: 30,
      attendanceReminderStartTime: { time: '07:00', ampm: 'AM' }, // <-- CORRECCIÓN: Nuevo formato
      attendanceReminderEndTime: { time: '10:00', ampm: 'PM' },   // <-- CORRECCIÓN: Nuevo formato
      enableClosingReminder: true,
      closingReminderTime: { time: '06:00', ampm: 'PM' },   // <-- CORRECCIÓN: Nuevo formato
      enableTripNotifications: true,
      batchSize: 10,
      retryAttempts: 3
    };
  } catch (error) {
    console.error('[DEBUG] Error al obtener configuración de notificaciones:', error);
    return null;
  }
}

// --- FUNCIÓN CORREGIDA: Ahora respeta la opción "No Usar Transporte Hoy" ---
async function getEmployeesNeedingReminder(clientId) {
  console.log(`[DEBUG] getEmployeesNeedingReminder llamado para clientId: ${clientId}`);
  try {
    const db = admin.firestore();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    
    console.log(`[DEBUG] Rango de fecha: ${today.toISOString()} a ${tomorrow.toISOString()}`);
    
    const vinculosSnapshot = await db.collection('vinculos')
      .where('clientId', '==', clientId)
      .where('rol', '==', 'empleado')
      .where('activo', '==', true)
      .get();
    
    console.log(`[DEBUG] Vínculos de empleados encontrados: ${vinculosSnapshot.size}`);
    const employeeIds = vinculosSnapshot.docs.map(doc => doc.data().userId);
    console.log(`[DEBUG] IDs de empleados encontrados:`, employeeIds);
    
    if (employeeIds.length === 0) {
      console.log('[DEBUG] No hay empleados vinculados para este cliente.');
      return [];
    }
    
    const asistenciasSnapshot = await db.collection('asistencias')
      .where('clientId', '==', clientId)
      .where('fecha', '>=', admin.firestore.Timestamp.fromDate(today))
      .where('fecha', '<', admin.firestore.Timestamp.fromDate(tomorrow))
      .get();
    
    console.log(`[DEBUG] Asistencias de hoy encontradas: ${asistenciasSnapshot.size}`);
    const employeeIdsWithAttendance = new Set();
    asistenciasSnapshot.docs.forEach(doc => {
      employeeIdsWithAttendance.add(doc.data().empleadoId);
    });
    console.log(`[DEBUG] IDs de empleados con asistencia registrada:`, Array.from(employeeIdsWithAttendance));
    
    const optedOutUserIds = new Set();
    console.log('[DEBUG] Buscando usuarios que han optado por no usar transporte hoy...');

    const suscripcionesSnapshot = await db.collection('suscripciones')
      .where('clientId', '==', clientId)
      .where('dailyOptOut', '==', true)
      .get();

    suscripcionesSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.dailyOptOutDate && data.dailyOptOutDate.toDate().toDateString() === today.toDateString()) {
        optedOutUserIds.add(data.userId);
      }
    });

    console.log(`[DEBUG] Usuarios que han optado por salir hoy:`, Array.from(optedOutUserIds));
    
    const employeesNeedingReminder = employeeIds.filter(id => 
      !employeeIdsWithAttendance.has(id) && !optedOutUserIds.has(id)
    );
    
    console.log(`[DEBUG] RESULTADO FINAL: Empleados que necesitan recordatorio:`, employeesNeedingReminder);
    return employeesNeedingReminder;
  } catch (error) {
    console.error('[DEBUG] Error al obtener empleados que necesitan recordatorio:', error);
    return [];
  }
}

// Función para enviar notificaciones a usuarios (CORREGIDA Y MEJORADA)
async function sendNotificationsToUsers(userIds, payload, clientId) {
  console.log(`[DEBUG] sendNotificationsToUsers llamado para ${userIds.length} usuarios.`);
  try {
    if (!userIds || userIds.length === 0) {
      console.log('[DEBUG] No hay usuarios a quienes notificar.');
      return { success: true, message: 'No hay usuarios a quienes notificar' };
    }
    
    const db = admin.firestore();
    const results = [];
    
    // Optimización: obtener todas las suscripciones en una sola consulta
    const suscripcionesSnapshot = await db.collection('suscripciones')
      .where('clientId', '==', clientId)
      .where(admin.firestore.FieldPath.documentId(), 'in', userIds)
      .get();
    
    const suscripcionesMap = new Map();
    suscripcionesSnapshot.forEach(doc => {
      const data = doc.data();
      suscripcionesMap.set(doc.id, data.subscription);
    });
    
    for (const userId of userIds) {
      console.log(`[DEBUG] Procesando notificación para el usuario: ${userId}`);
      
      const subscription = suscripcionesMap.get(userId);
      
      if (!subscription || !subscription.endpoint) {
        console.log(`[DEBUG] Suscripción inválida para el usuario: ${userId}`);
        results.push({ userId, success: false, error: 'Suscripción inválida' });
        continue;
      }
      
      // CORRECCIÓN: Asegurarnos de incluir userId y clientId en los datos de la notificación
      const personalizedPayload = {
        ...payload,
        data: {
          ...payload.data,
          userId: userId,
          clientId: clientId
        }
      };

      try {
        await webPush.sendNotification(subscription, JSON.stringify(personalizedPayload));
        console.log(`[DEBUG] ✅ Recordatorio interactivo enviado con éxito al usuario: ${userId}`);
        results.push({ userId, success: true });
      } catch (error) {
        console.error(`[DEBUG] ❌ Error al enviar recordatorio interactivo al usuario ${userId}:`, error.message);
        
        if (error.statusCode === 410) {
          console.log(`[DEBUG] Eliminando suscripción inválida para el usuario: ${userId}`);
          try {
            await db.collection('suscripciones').doc(userId).delete();
          } catch (deleteError) {
            console.error(`[DEBUG] Error al eliminar suscripción inválida: ${deleteError.message}`);
          }
        }
      
        results.push({ userId, success: false, error: error.message });
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`[DEBUG] Resultados del envío:`, results);
    return { success: true, results };
  } catch (error) {
    console.error('[DEBUG] Error al enviar recordatorios:', error);
    return { success: false, error: error.message };
  }
}

// --- FUNCIÓN CLAVE CORREGIDA: Ahora considera la zona horaria y el nuevo formato de hora ---
function isWithinReminderRange(startTime, endTime) {
  // 1. Obtener la hora actual UTC
  const nowUTC = new Date();
  console.log(`[DEBUG] Hora actual en el servidor (UTC): ${nowUTC.toISOString()}`);

  // 2. Ajustar a la zona horaria local (Venezuela, UTC-4)
  const offsetHours = -4; 
  const nowLocal = new Date(nowUTC.getTime() + (offsetHours * 60 * 60 * 1000));
  console.log(`[DEBUG] Hora ajustada a la zona local (UTC${offsetHours}): ${nowLocal.toISOString()}`);
  
  const currentMinutes = nowLocal.getHours() * 60 + nowLocal.getMinutes();
  console.log(`[DEBUG] Hora actual en minutos para la comprobación: ${currentMinutes}`);
  
  // CORRECCIÓN: Manejar el nuevo formato de hora (objeto con time y ampm)
  let startHour, startMinute, endHour, endMinute;
  
  if (typeof startTime === 'object' && startTime.time) {
    // Nuevo formato: objeto con time y ampm
    const [startHours, startMinutes] = startTime.time.split(':').map(Number);
    const [endHours, endMinutes] = endTime.time.split(':').map(Number);
    
    // Convertir a formato 24h
    startHour = startTime.ampm === 'PM' && startHours < 12 ? startHours + 12 : startHours;
    startMinute = startMinutes;
    endHour = endTime.ampm === 'PM' && endHours < 12 ? endHours + 12 : endHours;
    endMinute = endMinutes;
  } else {
    // Formato antiguo: cadena "HH:MM"
    const [startHours, startMinutes] = startTime.split(':').map(Number);
    const [endHours, endMinutes] = endTime.split(':').map(Number);
    
    startHour = startHours;
    startMinute = startMinutes;
    endHour = endHours;
    endMinute = endMinutes;
  }
  
  const startMinutes = startHour * 60 + startMinute;
  const endMinutes = endHour * 60 + endMinute;
  
  let isInRange;
  if (startMinutes > endMinutes) {
    isInRange = currentMinutes >= startMinutes || currentMinutes <= endMinutes;
    console.log(`[DEBUG] Verificación de hora (cruce medianoche): Actual=${currentMinutes}, Inicio=${startMinutes}, Fin=${endMinutes}, DentroDeRango=${isInRange}`);
  } else {
    isInRange = currentMinutes >= startMinutes && currentMinutes <= endMinutes;
    console.log(`[DEBUG] Verificación de hora: Actual=${currentMinutes}, Inicio=${startMinutes}, Fin=${endMinutes}, DentroDeRango=${isInRange}`);
  }
  
  return isInRange;
}

exports.handler = async function (event, context) {
  console.log('=== INICIO send-attendance-reminder (VERSIÓN FINAL CORREGIDA) ===');
  console.log(`[DEBUG] Hora de ejecución del servidor (UTC): ${new Date().toISOString()}`);
  
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY || 
      !process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
    console.error('[DEBUG] Configuración incompleta. Verifica las variables de entorno.');
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Configuración incompleta' }),
    };
  }
  
  try {
    const db = admin.firestore();
    const clientsSnapshot = await db.collection('clientes').get();
    
    if (clientsSnapshot.empty) {
      console.log('[DEBUG] No hay clientes activos.');
      return { 
        statusCode: 200, 
        body: JSON.stringify({ message: 'No hay clientes activos.' }) 
      };
    }
    
    console.log(`[DEBUG] Se encontraron ${clientsSnapshot.size} clientes para procesar.`);
    const results = [];
    
    for (const clientDoc of clientsSnapshot.docs) {
      const clientId = clientDoc.id;
      const clientName = clientDoc.data().nombre || 'Cliente sin nombre';
      
      console.log(`[DEBUG] --- Procesando cliente: ${clientName} (${clientId}) ---`);
      
      const config = await getNotificationConfig(clientId);
      
      if (!config || !config.enableNotifications || !config.enableAttendanceReminder) {
        console.log(`[DEBUG] Recordatorios de asistencia desactivados para el cliente: ${clientName}`);
        continue;
      }

      console.log(`[DEBUG] Configuración para ${clientName}:`, config);

      if (!isWithinReminderRange(config.attendanceReminderStartTime, config.attendanceReminderEndTime)) {
        console.log(`[DEBUG] Fuera del rango horario de recordatorios para: ${clientName}`);
        continue;
      }
      
      const nowUTC = new Date();
      const offsetHours = -4; // Mismo offset que en la función de comprobación
      const nowLocal = new Date(nowUTC.getTime() + (offsetHours * 60 * 60 * 1000));
      const currentMinutes = nowLocal.getHours() * 60 + nowLocal.getMinutes();
      
      const frequencyInMinutes = config.attendanceReminderFrequency || 30;
      const shouldRun = currentMinutes % frequencyInMinutes === 0;
      console.log(`[DEBUG] Verificación de frecuencia: Minutos actuales=${currentMinutes}, Frecuencia=${frequencyInMinutes}, DebeEjecutarse=${shouldRun}`);
      
      if (!shouldRun) {
        console.log(`[DEBUG] No es hora de enviar recordatorio para: ${clientName}`);
        continue;
      }
      
      console.log(`[DEBUG] Enviando recordatorio de asistencia para: ${clientName}`);
      
      const employeesNeedingReminder = await getEmployeesNeedingReminder(clientId);
      
      if (employeesNeedingReminder.length > 0) {
        console.log(`[DEBUG] ${employeesNeedingReminder.length} empleados necesitan recordatorio. Preparando payload...`);
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
        console.log(`[DEBUG] Todos los empleados han registrado asistencia o han optado por salir para: ${clientName}`);
      }
    }
    
    console.log('=== FIN send-attendance-reminder (VERSIÓN FINAL CORREGIDA) ===');
    return {
      statusCode: 200,
      body: JSON.stringify({ 
        message: 'Proceso de recordatorios interactivos completado.',
        results: results
      }),
    };
  } catch (error) {
    console.error('[DEBUG] Error en la función de recordatorio interactivo:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Error interno del servidor', details: error.message }),
    };
  }
};