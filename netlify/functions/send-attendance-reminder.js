// netlify/functions/send-attendance-reminder.js (VERSIÓN CORREGIDA)

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

// FUNCIÓN CORREGIDA: Ahora busca en la subcolección 'notificaciones'
async function getNotificationConfig(clientId) {
  console.log(`[DEBUG] getNotificationConfig llamado para clientId: ${clientId}`);
  try {
    const db = admin.firestore();
    const notificacionesSnapshot = await db.collection('clientes').doc(clientId)
      .collection('configuracion').doc('notificaciones')
      .collection('notificaciones')
      .limit(1) // Solo necesitamos el primer documento que encontremos
      .get();
    
    if (!notificacionesSnapshot.empty) {
      const configDoc = notificacionesSnapshot.docs[0];
      console.log(`[DEBUG] Configuración encontrada para ${clientId} en el documento ${configDoc.id}:`, configDoc.data());
      return configDoc.data();
    }
    
    console.log(`[DEBUG] No se encontró configuración para ${clientId}. Usando configuración por defecto.`);
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
    console.error('[DEBUG] Error al obtener configuración de notificaciones:', error);
    return null;
  }
}

// Función para obtener empleados sin registrar asistencia hoy y que no han optado por salir
async function getEmployeesNeedingReminder(clientId) {
  console.log(`[DEBUG] getEmployeesNeedingReminder llamado para clientId: ${clientId}`);
  try {
    const db = admin.firestore();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    
    console.log(`[DEBUG] Rango de fecha: ${today.toISOString()} a ${tomorrow.toISOString()}`);
    
    // 1. Obtener todos los usuarios de tipo empleado para este cliente
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
    
    // 2. Obtener las asistencias de hoy
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
    
    // 3. NOTA: La sección de "opt-out" está desactivada porque los campos no existen en tu base de datos.
    // Esto no causará errores, simplemente no filtrará a nadie por esta razón.
    const optedOutUserIds = new Set();
    console.log('[DEBUG] Los campos dailyOptOut y dailyOptOutDate no existen. La función de opt-out está desactivada.');
    
    // 4. Filtrar empleados que no tienen asistencia y no han optado por salir
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

// Función para enviar notificaciones a usuarios (CORREGIDA)
async function sendNotificationsToUsers(userIds, payload, clientId) {
  console.log(`[DEBUG] sendNotificationsToUsers llamado para ${userIds.length} usuarios.`);
  try {
    if (!userIds || userIds.length === 0) {
      console.log('[DEBUG] No hay usuarios a quienes notificar.');
      return { success: true, message: 'No hay usuarios a quienes notificar' };
    }
    
    const db = admin.firestore();
    const results = [];
    
    for (const userId of userIds) {
      console.log(`[DEBUG] Procesando notificación para el usuario: ${userId}`);
      const doc = await db.collection('suscripciones').doc(userId).get();
      if (!doc.exists) {
        console.log(`[DEBUG] No se encontró suscripción para el usuario: ${userId}`);
        results.push({ userId, success: false, error: 'Suscripción no encontrada' });
        continue;
      }

      const subscription = doc.data().subscription;
      
      if (!subscription || !subscription.endpoint) {
        console.log(`[DEBUG] Suscripción inválida para el usuario: ${userId}`);
        results.push({ userId, success: false, error: 'Suscripción inválida' });
        continue;
      }
      
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

// Función para verificar si la hora actual está dentro del rango de recordatorios
function isWithinReminderRange(startTime, endTime) {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  
  const [startHour, startMinute] = startTime.split(':').map(Number);
  const [endHour, endMinute] = endTime.split(':').map(Number);
  
  const startMinutes = startHour * 60 + startMinute;
  const endMinutes = endHour * 60 + endMinute;
  
  if (startMinutes > endMinutes) {
    const isInRange = currentMinutes >= startMinutes || currentMinutes <= endMinutes;
    console.log(`[DEBUG] Verificación de hora (cruce medianoche): Hora actual=${currentMinutes}, Inicio=${startMinutes}, Fin=${endMinutes}, DentroDeRango=${isInRange}`);
    return isInRange;
  } else {
    const isInRange = currentMinutes >= startMinutes && currentMinutes <= endMinutes;
    console.log(`[DEBUG] Verificación de hora: Hora actual=${currentMinutes}, Inicio=${startMinutes}, Fin=${endMinutes}, DentroDeRango=${isInRange}`);
    return isInRange;
  }
}

exports.handler = async function (event, context) {
  console.log('=== INICIO send-attendance-reminder (VERSIÓN DEFINITIVA) ===');
  console.log(`[DEBUG] Hora de ejecución del servidor: ${new Date().toISOString()}`);
  
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
      
      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      
      const frequencyInMinutes = config.attendanceReminderFrequency || 30;
      // Lógica de frecuencia: La función se ejecuta cada 5 minutos por cron.
      // Esta línea asegura que solo se envíe si el minuto actual es un múltiplo de la frecuencia.
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
    
    console.log('=== FIN send-attendance-reminder (VERSIÓN DEFINITIVA) ===');
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