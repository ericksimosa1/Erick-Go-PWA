// netlify/functions/send-attendance-reminder.cjs (VERSIÓN MEJORADA CON NOMBRES)
const webPush = require('web-push');
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

// Configurar claves VAPID
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

if (vapidPublicKey && vapidPrivateKey) {
    webpush.setVapidDetails({
        subject: 'mailto:erickgoapp@gmail.com',
        publicKey: vapidPublicKey,
        privateKey: vapidPrivateKey
    });
} else {
    console.warn(">>> [WARN] Claves VAPID no encontradas en variables de entorno. Las notificaciones pueden fallar.");
}

// --- FUNCIÓN MEJORADA: Ahora busca en el lugar correcto y maneja el nuevo formato de hora ---
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
        
        console.log(`[DEBUG] No se encontró configuración para ${clientId}. Usando defaults.`);
        return {
            enableNotifications: true,
            enableAttendanceReminder: true,
            attendanceReminderFrequency: 30,
            attendanceReminderTime: '09:00', // Default simple string
            enableClosingReminder: true,
            closingReminderTime: '18:00', // Default simple string
            enableTripNotifications: true,
            batchSize: 10,
            retryAttempts: 3
        };
    } catch (error) {
        console.error('[DEBUG] Error al obtener config:', error);
        return null;
    }
}

exports.handler = async function (event, context) {
    console.log('=== INICIO send-attendance-reminder (VERSIÓN MEJORADA CON NOMBRES) ===');
    console.log(`[DEBUG] Hora de ejecución del servidor (UTC): ${new Date().toISOString()}`);  
  
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY || 
          !process.env.FIREBASE_PROJECT_ID) {
        console.error('[DEBUG] Configuración incompleta.');
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
        
        const results = [];
        
        for (const clientDoc of clientsSnapshot.docs) {
            const clientId = clientDoc.id;
            const clientName = clientDoc.data().nombre || 'Cliente sin nombre';
            
            console.log(`[DEBUG] --- Procesando cliente: ${clientName} (${clientId}) ---`);
            
            const config = await getNotificationConfig(clientId);
            
            if (!config || !config.enableNotifications || !config.enableAttendanceReminder) {
                console.log(`[DEBUG] Recordatorios de asistencia desactivados para: ${clientName}`);
                continue;
            }

            // Manejo de hora: Soportar tanto objeto 12h como string 24h
            let reminderTime24h;
            if (typeof config.attendanceReminderTime === 'object' && config.attendanceReminderTime.time) {
                const { time, ampm } = config.attendanceReminderTime;
                const [hours, minutes] = time.split(':');
                let hoursNum = parseInt(hours, 10);
                if (ampm === 'PM' && hoursNum < 12) hoursNum += 12;
                if (ampm === 'AM' && hoursNum === 12) hoursNum = 0;
                reminderTime24h = `${hoursNum.toString().padStart(2,'0')}:${minutes}`;
            } else {
                reminderTime24h = config.attendanceReminderTime;
            }

            const now = new Date();
            const targetHour = parseInt(reminderTime24h.split(':')[0], 10);
            const targetMinute = parseInt(reminderTime24h.split(':')[1], 10);
            
            // Zona horaria Venezuela (-4 horas)
            const nowHour = (now.getHours() - 4 + 24) % 24; // Ajuste simple a GMT-4
            const nowMinute = now.getMinutes();
            
            // Verificar si es la hora exacta (o 15 minutos después)
            const isExactTime = (nowHour === targetHour && nowMinute >= targetMinute && nowMinute <= targetMinute + 15);
            const isExactTime15 = (nowHour === targetHour && nowMinute >= targetMinute + 16 && nowMinute <= targetMinute + 30);
            
            if (isExactTime || isExactTime15) {
                console.log(`[DEBUG] Dentro de la ventana horaria (${reminderTime24h}) para ${clientName}. Buscando empleados...`);
            } else {
                console.log(`[DEBUG] Fuera de la ventana horaria para ${clientName}.`);
                continue;
            }

            const vinculosSnapshot = await db.collection('vinculos')
                .where('clientId', '==', clientId)
                .where('rol', '==', 'empleado')
                .where('activo', '==', true)
                .get();
            
            if (vinculosSnapshot.empty) continue;
            const employeeIds = vinculosSnapshot.docs.map(doc => doc.data().userId);
            
            // Filtrar empleados que ya optaron por no usar transporte hoy
            const suscripcionesSnapshot = await db.collection('suscripciones')
                .where('clientId', '==', clientId)
                .where('dailyOptOut', '==', true)
                .get();
            
            const optedOutUserIds = new Set();
            suscripcionesSnapshot.forEach(doc => {
                const data = doc.data();
                const optOutDate = data.dailyOptOutDate ? data.dailyOptOutDate.toDate() : null;
                const today = new Date();
                today.setHours(0,0,0,0);
                if (optOutDate && optOutDate.getTime() === today.getTime()) {
                    optedOutUserIds.add(data.userId);
                }
            });
            
            const targetEmployees = employeeIds.filter(id => !optedOutUserIds.has(id));
            
            if (targetEmployees.length === 0) {
                console.log(`[DEBUG] No hay objetivos válidos para ${clientName}`);
                continue;
            }
            
            const payload = {
                title: 'Recordatorio de Asistencia',
                body: 'Aún no has registrado tu asistencia ni seleccionado zona de destino. Por favor hazlo.',
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
            
            console.log(`[DEBUG] Enviando notificación a ${targetEmployees.length} empleados de ${clientName}`);
            
            let sentCount = 0;
            for (const userId of targetEmployees) {
                try {
                    // Buscar suscripción específica del usuario
                    const subDoc = await db.collection('suscripciones').doc(userId).get();
                    if (!subDoc.exists()) continue;
                    
                    const subscription = subDoc.data().subscription;
                    if (!subscription || !subscription.endpoint) continue;

                    // Obtener nombre del usuario
                    const userDoc = await db.collection('usuarios').doc(userId).get();
                    const userName = userDoc.exists() ? userDoc.data().nombre : 'Empleado';
                    
                    // Personalizar payload con nombre
                    const personalizedPayload = {
                        ...payload,
                        body: `${userName}, ${payload.body}`,
                        data: { ...payload.data, userId: userId, clientId: clientId, userName: userName }
                    };

                    await webpush.sendNotification(subscription, JSON.stringify(personalizedPayload));
                    sentCount++;
                } catch (error) {
                    if (error.statusCode === 410) {
                        console.log(`[DEBUG] Eliminando suscripción inválida de ${userId}`);
                        await db.collection('suscripciones').doc(userId).delete();
                    }
                }
            }
            
            results.push({
                clientId,
                clientName,
                type: 'attendance_reminder_interactive',
                recipients: targetEmployees.length,
                sentCount: sentCount
            });
        }
        
        console.log('=== FIN send-attendance-reminder (VERSIÓN MEJORADA CON NOMBRES) ===');
        return {
            statusCode: 200,
            body: JSON.stringify({ 
                message: 'Proceso de recordatorio interactivo completado.',
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