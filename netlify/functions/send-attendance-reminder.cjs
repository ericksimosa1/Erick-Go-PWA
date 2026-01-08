// netlify/functions/send-attendance-reminder.cjs (VERSIÓN FINAL CON NOMBRE DE EMPRESA)
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
        console.log('>>> [SUCCESS] Firebase Admin inicializado.');
    } catch (error) {
        console.error('>>> [ERROR] Error al inicializar Firebase Admin:', error);
        throw new Error("Configuración faltante");
    }
}

// Configurar claves VAPID
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

if (vapidPublicKey && vapidPrivateKey) {
    webPush.setVapidDetails({
        subject: 'mailto:erickgoapp@gmail.com',
        publicKey: vapidPublicKey,
        privateKey: vapidPrivateKey
    });
} else {
    console.warn(">>> [WARN] Claves VAPID no encontradas.");
}

// --- FUNCIÓN MEJORADA ---
async function getNotificationConfig(clientId) {
    try {
        const db = admin.firestore();
        const notificacionesDoc = await db.collection('clientes').doc(clientId)
            .collection('configuracion').doc('notificaciones')
            .get();
        
        if (notificacionesDoc.exists) {
            return notificacionesDoc.data();
        }
        
        return {
            enableNotifications: true,
            enableAttendanceReminder: true,
            attendanceReminderFrequency: 30,
            attendanceReminderTime: '09:00',
            enableClosingReminder: true,
            closingReminderTime: '18:00',
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
    console.log('=== INICIO send-attendance-reminder ===');
    
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY || 
          !process.env.FIREBASE_PROJECT_ID) {
        return { statusCode: 500, body: JSON.stringify({ error: 'Configuración incompleta' }) };
    }
  
    try {
        const db = admin.firestore();
        const clientsSnapshot = await db.collection('clientes').get();
        
        if (clientsSnapshot.empty) {
            return { statusCode: 200, body: JSON.stringify({ message: 'No hay clientes activos.' }) };
        }
        
        const results = [];
        
        for (const clientDoc of clientsSnapshot.docs) {
            const clientId = clientDoc.id;
            const clientName = clientDoc.data().nombre || 'Cliente sin nombre';
            
            const config = await getNotificationConfig(clientId);
            
            if (!config || !config.enableNotifications || !config.enableAttendanceReminder) {
                continue;
            }

            // Manejo de hora
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
            const nowHour = (now.getHours() - 4 + 24) % 24; 
            const nowMinute = now.getMinutes();
            
            // Ventana de 30 minutos
            const isExactTime = (nowHour === targetHour && nowMinute >= targetMinute && nowMinute <= targetMinute + 15);
            const isExactTime15 = (nowHour === targetHour && nowMinute >= targetMinute + 16 && nowMinute <= targetMinute + 30);
            
            if (!isExactTime && !isExactTime15) {
                continue;
            }

            const vinculosSnapshot = await db.collection('vinculos')
                .where('clientId', '==', clientId)
                .where('rol', '==', 'empleado')
                .where('activo', '==', true)
                .get();
            
            if (vinculosSnapshot.empty) continue;
            const employeeIds = vinculosSnapshot.docs.map(doc => doc.data().userId);
            
            // Filtrar Opt-Outs
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
                if (optOutDate) {
                    const optDateClean = new Date(optOutDate);
                    optDateClean.setHours(0,0,0,0);
                    if (optDateClean.getTime() === today.getTime()) {
                        optedOutUserIds.add(data.userId);
                    }
                }
            });
            
            const targetEmployees = employeeIds.filter(id => !optedOutUserIds.has(id));
            
            if (targetEmployees.length === 0) continue;
            
            // --- AQUÍ ESTÁ EL CAMBIO ---
            const payload = {
                title: 'Recordatorio de Asistencia',
                body: `Aún no has registrado tu asistencia ni seleccionado zona de destino en ${clientName}. Por favor hazlo.`,
                icon: '/erick-go-logo.png',
                tag: 'attendance-reminder',
                renotify: true,
                requireInteraction: true,
                actions: [
                    { action: 'register_attendance', title: 'Registrar Asistencia' },
                    { action: 'opt_out_transport', title: 'No Usar Transporte Hoy' }
                ],
                data: { url: '/login', type: 'attendance_reminder' }
            };
            
            let sentCount = 0;
            for (const userId of targetEmployees) {
                try {
                    const subDoc = await db.collection('suscripciones').doc(userId).get();
                    if (!subDoc.exists) continue;
                    
                    const subscription = subDoc.data().subscription;
                    if (!subscription || !subscription.endpoint) continue;

                    const userDoc = await db.collection('usuarios').doc(userId).get();
                    const userName = userDoc.exists() ? userDoc.data().nombre : 'Empleado';
                    
                    // Como payload.body ya tiene el nombre de la empresa, aquí se mantiene
                    const personalizedPayload = {
                        ...payload,
                        body: `${userName}, ${payload.body}`,
                        data: { ...payload.data, userId: userId, clientId: clientId, userName: userName }
                    };

                    await webPush.sendNotification(subscription, JSON.stringify(personalizedPayload));
                    sentCount++;
                } catch (error) {
                    if (error.statusCode === 410) {
                        await db.collection('suscripciones').doc(userId).delete();
                    }
                }
            }
            
            results.push({ clientId, clientName, recipients: targetEmployees.length, sentCount: sentCount });
        }
        
        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Proceso completado.', results: results }),
        };
    } catch (error) {
        console.error('[DEBUG] Error en la función de recordatorio:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Error interno del servidor', details: error.message }),
        };
    }
};