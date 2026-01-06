// netlify/functions/delete-user-auth.js
const admin = require('firebase-admin');

// ====================================================================
// INICIALIZACIÓN
// ====================================================================
if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    console.error(">>> [FATAL] Variable de entorno faltante");
    throw new Error("Configuración faltante");
}

let serviceAccount;
try {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
} catch (error) {
    console.error(">>> [ERROR] Error parseando clave:", error);
    throw new Error("Formato inválido en FIREBASE_SERVICE_ACCOUNT_KEY");
}

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log(">>> [SUCCESS] Firebase Admin inicializado.");
}

// ====================================================================
// HANDLER DE LA FUNCIÓN
// ====================================================================
exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { uid, clientId } = JSON.parse(event.body);

        if (!uid || !clientId) {
            return { statusCode: 400, body: JSON.stringify({ error: 'UID y ClientId son requeridos' }) };
        }

        const db = admin.firestore();

        console.log(`>>> [BACKEND] Analizando usuario ${uid} para cliente ${clientId}...`);

        // 1. Buscar TODOS los vínculos del usuario
        const vinculosRef = db.collection('vinculos');
        const allVinculosSnap = await vinculosRef.where('userId', '==', uid).get();

        // 2. Identificar vínculos activos en OTRAS empresas
        const otherVinculos = allVinculosSnap.docs.filter(doc => {
            const data = doc.data();
            return data.clientId !== clientId && data.activo !== false;
        });

        const isLastLink = otherVinculos.length === 0;
        console.log(`>>> [BACKEND] ¿Es el último vínculo activo? ${isLastLink} (Otros vínculos encontrados: ${otherVinculos.length})`);

        // 3. Eliminar el vínculo actual
        const currentVinculo = allVinculosSnap.docs.find(doc => doc.data().clientId === clientId);
        if (currentVinculo) {
            await vinculosRef.doc(currentVinculo.id).delete();
            console.log(`>>> [BACKEND] Vínculo ${currentVinculo.id} eliminado.`);
        }

        // 4. Si es el último vínculo, Borrar TODO
        if (isLastLink) {
            console.log(`>>> [BACKEND] Borrando completamente usuario ${uid}...`);

            // Borrar Suscripción
            try {
                const subRef = db.collection('suscripciones').doc(uid);
                const subSnap = await subRef.get();
                // CORRECCIÓN AQUÍ: Usar .exists como propiedad (sin paréntesis)
                if (subSnap.exists) {
                    await subRef.delete();
                    console.log(`>>> [BACKEND] Suscripción eliminada.`);
                }
            } catch (e) {
                console.warn(">>> [BACKEND] Advertencia al borrar suscripción:", e.message);
            }

            // Borrar Documento de Usuario
            await db.collection('usuarios').doc(uid).delete();
            console.log(`>>> [BACKEND] Documento de usuario eliminado.`);

            // Borrar de Authentication (Firebase Auth)
            await admin.auth().deleteUser(uid);
            console.log(`>>> [BACKEND] Usuario eliminado de Auth.`);

        } else {
            console.log(`>>> [BACKEND] Usuario sigue activo en otras empresas. Solo se eliminó el vínculo.`);
        }

        // IMPORTANTE: Retornamos isLastLink para que el Frontend sepa qué mensaje mostrar
        return {
            statusCode: 200,
            body: JSON.stringify({ 
                success: true, 
                message: 'Eliminación completada',
                isLastLink: isLastLink 
            })
        };

    } catch (error) {
        console.error(">>> [ERROR BACKEND]:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Error interno', details: error.message })
        };
    }
};