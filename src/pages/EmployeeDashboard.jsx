// src/pages/EmployeeDashboard.jsx
import React, { useState, useEffect } from 'react';
import { Box, Typography, Paper, List, ListItem, Alert, Button, CircularProgress, TextField, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import { HowToReg as HowToRegIcon, CheckCircle as CheckCircleIcon, AccessTime as AccessTimeIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useFirestore } from '../hooks/useFirestore';
import { useAuthStore } from '../store/authStore';

export default function EmployeeDashboard() {
    const navigate = useNavigate();
    const { user, selectedClientId } = useAuthStore();
    const { 
        fetchUserVinculos, 
        fetchZones, 
        setOrUpdateAsistencia, 
        fetchMyAsistenciaForToday, 
        setClosingTimeForDriver, 
        getTodayClosingTime, 
        notifyClosingTimeChange, 
        distributeClosingTimeToDrivers, 
        clearAllClosingTimesForToday,
        fetchDriversByZone,
        hasDriverClosingRecordToday,
        getTodayClosingPersonFromWeeklyConfig // <--- IMPORTANTE: Agregamos esta función para consultar la "Fuente de la Verdad"
    } = useFirestore();
    
    const [zones, setZones] = useState([]);
    const [loading, setLoading] = useState(true);
    const [myAsistencia, setMyAsistencia] = useState(null);
    const [successMessage, setSuccessMessage] = useState('');
    const [vinculos, setVinculos] = useState([]);
    const [isClosingPerson, setIsClosingPerson] = useState(false);
    const [closingTimeValue, setClosingTimeValue] = useState(''); 
    const [closingTimeDialog, setClosingTimeDialog] = useState(false);
    const [todayClosingTime, setTodayClosingTime] = useState(null);
    const [mustRegisterClosingTime, setMustRegisterClosingTime] = useState(false);
    const [selectedZone, setSelectedZone] = useState(null);
    const [initialized, setInitialized] = useState(false); 

    // --- FUNCIÓN ROBUSTA PARA NOTIFICACIONES ---
    const sendAttendanceNotificationToDrivers = async (zoneId, zoneName) => {
        // 🔒 DETECCIÓN ROBUSTA DE MODO DESARROLLO (POR URL)
        const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        
        if (isDev) {
            console.log(`[MODO DESARROLLO] Se omite el envío de notificación de asistencia a la zona: ${zoneName}`);
            return; 
        }
        
        console.log(`Enviando notificación de asistencia a conductores de la zona ${zoneName}...`);
        const notificationPayload = {
            title: 'Nuevo Registro de Asistencia',
            body: `El empleado ${user.nombre} ha registrado su asistencia en la zona: ${zoneName}.`,
            icon: '/erick-go-logo.png',
            data: {
                url: '/conductor-dashboard' 
            }
        };

        try {
            // 1. Obtener los IDs de los conductores asignados a esta zona
            const driverIds = await fetchDriversByZone(selectedClientId, zoneId);

            // 2. FILTRAR para asegurar que solo queden IDs de cadenas de texto válidas
            const validDriverIds = driverIds.filter(id => id && typeof id === 'string');

            if (validDriverIds.length === 0) {
                console.log(`No hay conductores válidos asignados a la zona ${zoneName}. No se envían notificaciones.`);
                return;
            }

            // 3. Enviar la notificación usando el array de IDs
            const response = await fetch('/.netlify/functions/send-notification', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    userIds: validDriverIds, 
                    payload: notificationPayload,
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error("ERROR DEL SERVIDOR (TEXTO):", errorText);
                throw new Error(errorText || 'Error al enviar notificación.');
            }

            console.log(`Notificaciones de asistencia enviadas exitosamente a ${validDriverIds.length} conductores.`);
        } catch (error) {
            console.error('Error al enviar una o más notificaciones de asistencia:', error);
        }
    };

    // Función para convertir hora de formato 24h a 12h con AM/PM
    const formatTime12Hour = (time24) => {
        if (!time24) return '';
        
        // Si el formato ya incluye AM/PM, devolverlo tal cual
        if (time24.includes('AM') || time24.includes('PM')) {
            return time24;
        }
        
        // Dividir la hora y los minutos
        const [hours, minutes] = time24.split(':');
        
        // Convertir a número
        const hour = parseInt(hours, 10);
        
        // Determinar AM o PM
        const period = hour >= 12 ? 'PM' : 'AM';
        
        // Convertir a formato 12 horas
        const hour12 = hour % 12 || 12; // El operador || convierte 0 a 12
        
        // Formatear con ceros a la izquierda si es necesario
        return `${hour12.toString().padStart(2, '0')}:${minutes} ${period}`;
    };

    // EFECTO 1: Inicialización y manejo de empresa
    useEffect(() => {
        if (!user || initialized) {
            setLoading(false);
            return;
        }

        const initializeDashboard = async () => {
            console.log("=== EmployeeDashboard: INICIALIZANDO ===");
            console.log("Usuario logueado:", user.uid);
            console.log("Empresa seleccionada al iniciar:", selectedClientId);
            setLoading(true);

            try {
                const userVinculos = await fetchUserVinculos(user.uid);
                console.log("Vínculos obtenidos de BD:", userVinculos);
                setVinculos(userVinculos);

                let targetClientId = selectedClientId;

                if (!targetClientId) {
                    if (userVinculos.length === 1) {
                        targetClientId = userVinculos[0].clientId;
                        console.log("Auto-seleccionando la única empresa:", targetClientId);
                        useAuthStore.getState().setSelectedClient(targetClientId);
                    } else if (userVinculos.length > 1) {
                        console.log("Múltiples empresas y sin selección. Redirigiendo...");
                        navigate('/select-company');
                        setLoading(false);
                        return;
                    }
                }

                if (targetClientId) {
                    console.log("Empresa a cargar:", targetClientId);
                    
                    // ========================================================================
                    // CORRECCIÓN CRÍTICA: Verificar encargado usando la Configuración Semanal
                    // ========================================================================
                    
                    // 1. Consultar quién es el encargado HOY según la configuración semanal
                    const todaysClosingPerson = await getTodayClosingPersonFromWeeklyConfig(targetClientId);
                    
                    console.log("Encargado según Config Semanal:", todaysClosingPerson);
                    console.log("ID del usuario actual:", user.uid);

                    // 2. Verificar si YO soy ese usuario
                    const amIClosingPerson = todaysClosingPerson && todaysClosingPerson.userId === user.uid;
                    
                    if (amIClosingPerson) {
                        console.log("✅ El usuario ES el encargado de cierre hoy.");
                        setIsClosingPerson(true);
                        
                        // PASO 2: Verificar SI YA EXISTE una hora de cierre en la configuración diaria para hoy
                        console.log("Usuario es encargado de cierre. Verificando si ya existe hora registrada en BD...");
                        const existingTime = await getTodayClosingTime(targetClientId);

                        if (existingTime) {
                            console.log("Hora de cierre encontrada en configuración diaria:", existingTime);
                            setTodayClosingTime(existingTime);
                            setClosingTimeValue(existingTime);
                            setMustRegisterClosingTime(false);
                        } else {
                            console.log("No se encontró hora de cierre configurada para hoy. Es obligatorio registrarla.");
                            setTodayClosingTime(null);
                            setClosingTimeValue('');
                            setMustRegisterClosingTime(true);
                        }
                    } else {
                        console.log("❌ El usuario NO es el encargado de cierre hoy.");
                        setIsClosingPerson(false);
                        setMustRegisterClosingTime(false);
                    }
                    // ========================================================================
                }

            } catch (error) {
                console.error("EmployeeDashboard: Error durante la inicialización:", error);
            } finally {
                setLoading(false);
                setInitialized(true);
            }
        };

        initializeDashboard();
    }, [user, navigate, fetchUserVinculos, getTodayClosingTime, initialized, getTodayClosingPersonFromWeeklyConfig]);

    // EFECTO 2: Carga de datos específicos de la empresa
    useEffect(() => {
        console.log("=== EmployeeDashboard: EFECTO DE CARGA DE DATOS ===");
        console.log("Detectado cambio en selectedClientId a:", selectedClientId);
        
        if (!selectedClientId) {
            console.log("No hay selectedClientId. Limpiando zonas y asistencia.");
            setZones([]);
            setMyAsistencia(null);
            return;
        }

        const loadCompanyData = async () => {
            console.log("Iniciando carga de datos para la empresa:", selectedClientId);
            setLoading(true);
            try {
                const zonesData = await fetchZones(selectedClientId);
                console.log("Zonas recibidas de fetchZones:", zonesData);
                setZones(zonesData);
                console.log("Estado 'zones' actualizado con las nuevas zonas.");

                const asistencia = await fetchMyAsistenciaForToday(user.uid);
                setMyAsistencia(asistencia);
                console.log("Asistencia de hoy cargada.");
                
            } catch (error) {
                console.error("EmployeeDashboard: Error al cargar datos de la empresa:", error);
            } finally {
                setLoading(false);
            }
        };
        
        loadCompanyData();

    }, [selectedClientId, fetchZones, fetchMyAsistenciaForToday, isClosingPerson, getTodayClosingTime]);

    const handleCheckInOrChange = async (zoneId) => {
        try {
            if (!user?.uid || !selectedClientId) {
                throw new Error("Faltan datos del usuario o de la empresa.");
            }
            
            if (isClosingPerson && mustRegisterClosingTime) {
                alert("Como encargado de cierre, debes registrar la hora de cierre antes de registrar tu asistencia.");
                setClosingTimeDialog(true);
                return;
            }
            
            const selectedZoneObj = zones.find(z => z.id === zoneId);
            const zoneName = selectedZoneObj ? selectedZoneObj.nombre : 'Zona desconocida';

            // 1. Registrar la asistencia
            await setOrUpdateAsistencia(user.uid, zoneId, user.nombre, selectedClientId);
            
            setMyAsistencia({ zona: zoneId });
            setSuccessMessage(`¡Tu asistencia ha sido registrada en: ${zoneName}!`);
            setTimeout(() => setSuccessMessage(''), 5000);

            // 2. Obtener conductores de esta zona
            const driverIds = await fetchDriversByZone(selectedClientId, zoneId);
            const validDriverIds = driverIds.filter(id => id && typeof id === 'string');

            if (validDriverIds.length === 0) return;

            // 3. Verificar si existe hora de cierre definida
            const existingClosingTime = await getTodayClosingTime(selectedClientId);

            if (existingClosingTime) {
                // SI HAY HORA DE CIERRE: Verificamos conductor por conductor
                console.log(">>> Hora de cierre definida. Verificando quién necesita el aviso...");

                for (const driverId of validDriverIds) {
                    // PREGUNTA CLAVE: ¿Ya tiene un registro de cierre este conductor hoy?
                    const wasNotified = await hasDriverClosingRecordToday(selectedClientId, driverId);

                    if (!wasNotified) {
                        // NO TENÍA REGISTRO: Es su primer empleado o primer aviso.
                        // 1. Creamos el registro de cierre para él (asignamos la hora global)
                        await setClosingTimeForDriver(
                            selectedClientId, 
                            driverId, 
                            existingClosingTime, 
                            user, 
                            user.nombre
                        );
                        console.log(`>>> Creando registro de cierre y enviando notificación al conductor ${driverId}...`);

                        // 2. Le enviamos la notificación de cierre
                        const notificationPayload = {
                            title: 'Hora de Cierre Actualizada',
                            body: `Se ha registrado un empleado en tu zona. El horario de cierre hoy es a las ${formatTime12Hour(existingClosingTime)}.`,
                            icon: '/erick-go-logo.png',
                            data: { url: '/conductor-dashboard' }
                        };

                        const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
                        if (!isDev) {
                            await fetch('/.netlify/functions/send-notification', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    userIds: [driverId],
                                    payload: notificationPayload,
                                    clientId: selectedClientId,
                                }),
                            });
                        }
                    } else {
                        console.log(`>>> El conductor ${driverId} ya tenía registro de cierre. Se omite notificación de cierre.`);
                    }
                }
            }

            // 4. Notificar asistencia estándar (A TODOS los conductores de la zona, siempre)
            console.log(">>> Enviando notificación de asistencia a conductores...");
            await sendAttendanceNotificationToDrivers(zoneId, zoneName);
            console.log(">>> Notificación de asistencia enviada.");

        } catch (error) {
            console.error("Error al registrar la asistencia:", error);
            alert("Hubo un error al guardar tu zona. Por favor, intenta de nuevo.");
        }
    };

    const handleSetClosingTime = async () => {
        try {
            console.log("handleSetClosingTime called with:", {
                user: user?.uid,
                selectedClientId: selectedClientId,
                closingTimeValue: closingTimeValue
            });
            
            if (!user?.uid || !selectedClientId || !closingTimeValue) {
                console.error("Faltan datos para registrar la hora de cierre:", {
                    user: user?.uid,
                    selectedClientId: selectedClientId,
                    closingTimeValue: closingTimeValue
                });
                throw new Error("Faltan datos para registrar la hora de cierre.");
            }
            
            // CORRECCIÓN CRÍTICA: Aquí pasábamos 'user' (objeto) en lugar de 'user.uid' (string)
            // Esto causaba el error "n.indexOf is not a function" al intentar leer los datos corruptos.
            await setClosingTimeForDriver(selectedClientId, user.uid, closingTimeValue, user.uid, user.nombre);
            
            console.log("Actualizando estado local...");
            setTodayClosingTime(closingTimeValue);
            setMustRegisterClosingTime(false);
            setClosingTimeDialog(false);
            setSuccessMessage(`¡Hora de cierre registrada: ${formatTime12Hour(closingTimeValue)}!`);
            
            await distributeClosingTimeToDrivers(selectedClientId, closingTimeValue, user);
            
            if (selectedZone) {
                await setOrUpdateAsistencia(user, selectedZone, user.nombre, selectedClientId);
                setMyAsistencia({ zona: selectedZone });
                const selectedZoneObj = zones.find(z => z.id === selectedZone);
                const zoneName = selectedZoneObj ? selectedZoneObj.nombre : 'Zona desconocida';
                setSuccessMessage(`¡Hora de cierre registrada y asistencia en: ${zoneName}!`);
                setTimeout(() => setSuccessMessage(''), 5000);
            }

        } catch (error) {
            console.error("Error al registrar la hora de cierre:", error);
            alert("Hubo un error al registrar la hora de cierre. Por favor, intenta de nuevo.");
        }
    };

    const handleCloseClosingTimeDialog = () => {
        setClosingTimeDialog(false);
        if (isClosingPerson && mustRegisterClosingTime) {
            alert("Como encargado de cierre, debes registrar la hora de cierre antes de continuar.");
        }
    };

    if (loading) {
        return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>;
    }

    if (vinculos.length === 0) {
        return (
            <Box sx={{ width: '100%' }}>
                <Alert severity="error">
                    No tienes empresas asignadas. Por favor, contacte al administrador.
                </Alert>
            </Box>
        );
    }

    return (
        <Box sx={{ width: '100%' }}>
            <Typography variant="h4" gutterBottom>Panel del Empleado - Erick Go</Typography>
            
            {successMessage && <Alert severity="success" sx={{ mb: 2 }}>{successMessage}</Alert>}

            <Paper sx={{ p: 3, mt: 2 }}>
                <Typography variant="h6">Hola, {user?.nombre || 'Colaborador'}!</Typography>
                
                {/* Sección para el encargado de cerrar */}
                {isClosingPerson && (
                    <Box sx={{ mt: 2, p: 2, border: '1px solid #e0e0e0', borderRadius: 1, backgroundColor: '#f9f9f9' }}>
                        <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center' }}>
                            <AccessTimeIcon sx={{ mr: 1 }} />
                            Eres el encargado de cerrar hoy
                        </Typography>
                        
                        {mustRegisterClosingTime ? (
                            <Alert severity="warning" sx={{ mt: 2 }}>
                                Debes registrar la hora de cierre del local para poder continuar.
                            </Alert>
                        ) : (
                            <Alert severity="success" sx={{ mt: 2 }}>
                                Hora de cierre registrada para hoy: {formatTime12Hour(todayClosingTime)}
                                <Button 
                                    variant="text" 
                                    size="small" 
                                    sx={{ ml: 1 }}
                                    onClick={() => {
                                        setClosingTimeValue(todayClosingTime);
                                        setClosingTimeDialog(true);
                                    }}
                                >
                                    Cambiar
                                </Button>
                            </Alert>
                        )}
                        
                        {mustRegisterClosingTime && (
                            <Box sx={{ mt: 2 }}>
                                <Button 
                                    variant="contained" 
                                    color="warning" 
                                    startIcon={<AccessTimeIcon />}
                                    onClick={() => setClosingTimeDialog(true)}
                                >
                                    Registrar Hora de Cierre
                                </Button>
                            </Box>
                        )}
                    </Box>
                )}
                
                <Typography variant="body1" sx={{ mt: 2 }}>
                    Selecciona tu zona de destino para registrar tu asistencia diaria.
                </Typography>
                
                {zones.length > 0 ? (
                    <List sx={{ mt: 2 }}>
                        {zones.map((zone) => {
                            const isSelected = myAsistencia && myAsistencia.zona === zone.id && !myAsistencia.completado;
                            return (
                                <ListItem key={zone.id} disablePadding>
                                    <Button 
                                        variant={isSelected ? "contained" : "outlined"}
                                        color={isSelected ? "success" : "primary"}
                                        fullWidth
                                        startIcon={isSelected ? <CheckCircleIcon /> : <HowToRegIcon />}
                                        onClick={() => handleCheckInOrChange(zone.id)}
                                        sx={{ justifyContent: 'flex-start', p: 2, m: 0.5 }}
                                    >
                                        {isSelected ? `Seleccionado: ${zone.nombre}` : `Registrar en: ${zone.nombre}`}
                                    </Button>
                                </ListItem>
                            );
                        })}
                    </List>
                ) : (
                    <Alert severity="info" sx={{ mt: 2 }}>
                        No hay zonas registradas para esta empresa. Contacte al administrador.
                    </Alert>
                )}
                
                {myAsistencia && myAsistencia.completado && (
                    <Alert severity="success" sx={{ mt: 2 }}>
                        ¡Tu viaje de hoy ha sido completado! Gracias por tu asistencia.
                    </Alert>
                )}
            </Paper>

            {/* Diálogo para registrar hora de cierre */}
            <Dialog open={closingTimeDialog} onClose={handleCloseClosingTimeDialog}>
                <DialogTitle>Registrar Hora de Cierre</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" sx={{ mb: 2 }}>
                        Como encargado de cierre, debes registrar la hora de cierre del local para hoy.
                    </Typography>
                    <TextField
                        autoFocus
                        margin="dense"
                        id="closingTime"
                        label="Hora de Cierre"
                        type="time"
                        fullWidth
                        variant="standard"
                        value={closingTimeValue}
                        onChange={(e) => {
                            console.log("Valor cambiado:", e.target.value);
                            setClosingTimeValue(e.target.value);
                        }}
                        InputLabelProps={{
                            shrink: true,
                        }}
                        inputProps={{
                            step: 300, // 5 min
                        }}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseClosingTimeDialog}>Cancelar</Button>
                    <Button 
                        onClick={handleSetClosingTime} 
                        variant="contained"
                        disabled={!closingTimeValue}
                    >
                        Guardar
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}