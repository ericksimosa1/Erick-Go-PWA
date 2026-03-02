// netlify/functions/send-attendance-reminder.cjs
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
    webPush.setVapidDetails(
        'mailto:erickgoapp@gmail.com',
        vapidPublicKey,
        vapidPrivateKey
    );
} else {
    console.warn(">>> [WARN] Claves VAPID no encontradas.");
}

// --- FUNCIÓN AUXILIAR DE ZONA HORARIA ---
const getVenezuelaDate = () => {
    const now = new Date();
    return new Date(now.getTime() - (4 * 60 * 60 * 1000)); 
};

// --- FUNCIÓN DE CONFIGURACIÓN ---
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

            // --- LÓGICA DE TIEMPO (AJUSTADA A VENEZUELA) ---
            const startTimeStr = config.attendanceReminderStartTime || "09:00";
            const endTimeStr = config.attendanceReminderEndTime || "18:00";

            const [startH, startM] = startTimeStr.split(':').map(Number);
            const [endH, endM] = endTimeStr.split(':').map(Number);
            
            const nowVZLA = getVenezuelaDate();
            const currentHour = nowVZLA.getHours();
            const currentMinute = nowVZLA.getMinutes();
            
            const startMinutes = startH * 60 + startM;
            const endMinutes = endH * 60 + endM;
            const currentTotalMinutes = currentHour * 60 + currentMinute;

            console.log(`[DEBUG] Cliente: ${clientName}. Hora VZLA: ${currentHour}:${currentMinute}. Rango: ${startTimeStr} - ${endTimeStr}`);

            const isWithinWindow = (currentTotalMinutes >= startMinutes && currentTotalMinutes <= endMinutes);
            
            if (!isWithinWindow) {
                console.log(`[DEBUG] Fuera de horario. Se salta este cliente.`);
                continue;
            }
            // -----------------------------------------------------

            // --- 1. CONSULTA DE VINCULOS (EMPLEADOS) ---
            const vinculosSnapshot = await db.collection('vinculos')
                .where('clientId', '==', clientId)
                .get();
            
            const employeeIds = [];
            vinculosSnapshot.forEach(doc => {
                const data = doc.data();
                if (data.rol === 'empleado' && data.activo !== false) {
                    employeeIds.push(data.userId);
                }
            });

            if (employeeIds.length === 0) {
                console.log(`[DEBUG] No hay empleados activos para ${clientName}.`);
                continue;
            }

            // --- 2. CARGA DE ASISTENCIAS DE HOY (CORREGIDO ZONA HORARIA) ---
            const startOfDayVZLA = new Date(nowVZLA);
            startOfDayVZLA.setHours(0, 0, 0, 0);
            
            const endOfDayVZLA = new Date(startOfDayVZLA);
            endOfDayVZLA.setDate(endOfDayVZLA.getDate() + 1);

            const asistenciasSnapshot = await db.collection('asistencias')
                .where('clientId', '==', clientId)
                .where('fecha', '>=', admin.firestore.Timestamp.fromDate(startOfDayVZLA))
                .where('fecha', '<', admin.firestore.Timestamp.fromDate(endOfDayVZLA))
                .get();

            const attendanceMap = new Map();
            asistenciasSnapshot.forEach(doc => {
                attendanceMap.set(doc.data().empleadoId, true);
            });
            // -----------------------------------------------------

            // --- 3. CARGA DE SUSCRIPCIONES Y OPT-OUTS ---
            const suscripcionesSnapshot = await db.collection('suscripciones')
                .where('clientId', '==', clientId)
                .get();

            const suscripcionesMap = new Map();
            const optedOutUserIds = new Set();

            suscripcionesSnapshot.forEach(doc => {
                const data = doc.data();
                const uid = doc.id;
                
                // Lógica Opt-Out ajustada a Venezuela
                if (data.dailyOptOut === true) {
                    const optOutDate = data.dailyOptOutDate ? data.dailyOptOutDate.toDate() : null;
                    if (optOutDate) {
                        const optDateVZLA = new Date(optOutDate.getTime() - (4 * 60 * 60 * 1000));
                        optDateVZLA.setHours(0,0,0,0);
                        if (optDateVZLA.getTime() === startOfDayVZLA.getTime()) {
                            optedOutUserIds.add(uid);
                        }
                    }
                }
                
                if (data.subscription && data.subscription.endpoint) {
                    suscripcionesMap.set(uid, data.subscription);
                }
            });

            const potentialEmployees = employeeIds; 
            
            if (potentialEmployees.length === 0) continue;
            
            const payloadBase = {
                title: 'Recordatorio de Asistencia',
                body: `Aún no has registrado tu asistencia ni seleccionado zona de destino en ${clientName}. Por favor hazlo.`,
                icon: '/icons/android-chrome-192x192.png',
                badge: '/icons/badge-icon.png', // <--- CORRECCIÓN: BADGE AÑADIDO
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
            let skippedCount = 0;
            const employeeChunks = [];
            const copyIds = [...potentialEmployees];
            while(copyIds.length) employeeChunks.push(copyIds.splice(0, 10));

            // --- PROCESAMIENTO Y ENVIÓ ---
            for (const chunk of employeeChunks) {
                const usersSnap = await db.collection('usuarios')
                    .where(admin.firestore.FieldPath.documentId(), 'in', chunk)
                    .get();
                
                for (const doc of usersSnap.docs) {
                    const userId = doc.id;
                    const userName = doc.data().nombre || 'Empleado';

                    if (optedOutUserIds.has(userId)) {
                        console.log(`[SKIP] ${userName}: Marcó "No usar transporte" hoy.`);
                        skippedCount++;
                        continue;
                    }

                    if (attendanceMap.has(userId)) {
                        console.log(`[SKIP] ${userName}: Ya registró asistencia hoy.`);
                        skippedCount++;
                        continue;
                    }

                    if (!suscripcionesMap.has(userId)) {
                        console.log(`[SKIP] ${userName}: No tiene suscripción activa.`);
                        skippedCount++;
                        continue;
                    }

                    const subscription = suscripcionesMap.get(userId);
                    const personalizedPayload = {
                        ...payloadBase,
                        body: `${userName}, ${payloadBase.body}`,
                        data: { ...payloadBase.data, userId: userId, clientId: clientId, userName: userName }
                    };

                    try {
                        await webPush.sendNotification(subscription, JSON.stringify(personalizedPayload));
                        sentCount++;
                        console.log(`[OK] Notificación enviada a ${userName}`);
                    } catch (error) {
                        console.error(`[ERROR] Falló envío a ${userName}:`, error.message);
                        if (error.statusCode === 410) {
                            await db.collection('suscripciones').doc(userId).delete();
                        }
                    }
                }
            }
            
            results.push({ clientId, clientName, recipients: potentialEmployees.length, sentCount: sentCount, skippedCount: skippedCount });
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