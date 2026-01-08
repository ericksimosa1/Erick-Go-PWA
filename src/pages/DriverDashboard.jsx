// src/pages/DriverDashboard.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Box, Typography, Paper, List, ListItem, ListItemText, Alert, Button, CircularProgress, ToggleButton, ToggleButtonGroup, Divider, Card, CardContent } from '@mui/material';
import { PlayArrow as PlayArrowIcon, ViewList as ViewListIcon, Category as CategoryIcon, Done as DoneIcon, Stop as StopIcon, AccessTime as AccessTimeIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useFirestore } from '../hooks/useFirestore';
import { useAuthStore } from '../store/authStore';
import { doc, updateDoc, arrayUnion, Timestamp, addDoc, collection, getDocs, query, where } from 'firebase/firestore'; // CORRECCIÓN: Imports agregados para búsqueda directa de admins
import { db } from '../firebase';

export default function DriverDashboard() {
    const navigate = useNavigate();
    const { user, selectedClientId, clients } = useAuthStore(); // Agregado 'clients'
    const { 
        fetchUsers, 
        addTrip, 
        fetchTodayAsistencias, 
        fetchUserVinculos, 
        fetchZones,
        markAsistenciaAsCompleted,
        getTodayClosingTimes,
        clearTodayClosingTimeForDriver,
        notifyClosingTimeChange,
        listenToClosingTimeChanges,
        clearAllClosingTimesForToday,
        fetchDriversWithPendingEmployees
    } = useFirestore();
    
    // Obtener nombre de la empresa actual
    const clientName = clients.find(c => c.id === selectedClientId)?.nombre || 'Tu empresa';

    // Estados principales
    const [loading, setLoading] = useState(true);
    const [dataLoaded, setDataLoaded] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');
    
    // Datos de la aplicación
    const [allUsers, setAllUsers] = useState([]);
    const [allZones, setAllZones] = useState([]);
    const [todayAsistencias, setTodayAsistencias] = useState([]);
    const [vinculos, setVinculos] = useState([]);
    
    // Estados derivados
    const [availableEmployees, setAvailableEmployees] = useState([]);
    const [driverClosingTime, setDriverClosingTime] = useState(null);
    const [companyClosingTime, setCompanyClosingTime] = useState(null);
    const [hasRegisteredEmployees, setHasRegisteredEmployees] = useState(false);
    
    // Estados de viaje
    const [tripStarted, setTripStarted] = useState(false);
    const [isStartingTrip, setIsStartingTrip] = useState(false);
    const [activeTripId, setActiveTripId] = useState(null);
    const [droppedOffEmployees, setDroppedOffEmployees] = useState([]);
    const [trips, setTrips] = useState([]);
    
    // Estados de modo de viaje
    const [tripMode, setTripMode] = useState(null);
    const [userGroups, setUserGroups] = useState([]);
    const [groupedEmployees, setGroupedEmployees] = useState([]);
    const [loadingGroups, setLoadingGroups] = useState(false);

    const [driverWorkdayComplete, setDriverWorkdayComplete] = useState(false);

    const hasInitialized = useRef(false);
    const closingTimesLoaded = useRef(false);

    // --- FUNCIÓN PARA ENVIAR NOTIFICACIONES DE INICIO DE VIAJE A EMPLEADOS ---
    const sendTripStartedNotification = async (employees) => {
        // 🔒 PROTECCIÓN MODO DESARROLLO (Versión Robusta)
        const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        if (isDev) {
            console.log('[MODO DESARROLLO] Se omite el envío de notificación de inicio de viaje.');
            return; 
        }

        console.log(`Enviando notificación de inicio de viaje a ${employees.length} empleados...`);
        
        const notificationPayload = {
            title: '¡Tu viaje ha comenzado!',
            body: `Tu conductor, ${user.nombre} de ${clientName} ya está en el punto de encuentro, Prepárate para abordar.`,
            icon: '/erick-go-logo.png',
            data: {
                url: '/empleado-dashboard'
            }
        };

        const employeeIds = employees.map(emp => emp.empleadoId);

        try {
            const response = await fetch('/.netlify/functions/send-notification', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    userIds: employeeIds,
                    payload: notificationPayload,
                    clientId: selectedClientId
                }),
            });

            if (!response.ok) {
                throw new Error(`Error ${response.status}: ${response.statusText}`);
            }

            console.log('Notificaciones de inicio de viaje enviadas exitosamente.');
        } catch (error) {
            console.error('Error al enviar una o más notificaciones de inicio de viaje:', error);
        }
    };

    // --- NUEVA FUNCIÓN PARA ENVIAR ESTADO DEL VIAJE A ADMINISTRADORES ---
    const sendTripStatusToAdmins = async (status, driverName, employeeCount) => {
        // 🔒 PROTECCIÓN MODO DESARROLLO (Versión Robusta)
        const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        if (isDev) {
            console.log('[MODO DESARROLLO] Se omite el envío de notificación de viaje a administradores.');
            return; 
        }

        console.log(`Enviando notificación de viaje ${status} a administradores...`);
        
        // CORRECCIÓN CRÍTICA: Buscamos admins DIRECTAMENTE en 'usuarios'
        // porque 'allUsers' viene filtrado por vinculos y el admin puede no tener vínculo.
        let admins = [];
        try {
            // Asumimos que 'rol' es top-level en la colección usuarios
            const adminsSnapshot = await getDocs(query(collection(db, 'usuarios'), where('rol', '==', 'administrador')));
            // Transformamos el snapshot en el formato esperado por la lógica de envío
            admins = adminsSnapshot.docs.map(doc => ({ userId: doc.id, userData: doc.data() }));
        } catch (error) {
            console.error("Error al obtener administradores directos:", error);
        }
        
        if (admins.length === 0) {
            console.log("No hay administradores encontrados en la base de datos para notificar.");
            return;
        }

        let notificationPayload;
        if (status === 'started') {
            notificationPayload = {
                title: 'Viaje Iniciado',
                body: `El conductor ${driverName} de ${clientName} ha iniciado un viaje con ${employeeCount} empleado(s).`,
                icon: '/erick-go-logo.png',
                data: { url: '/admin-dashboard' }
            };
        } else if (status === 'ended') {
            notificationPayload = {
                title: 'Jornada Finalizada',
                body: `El conductor ${driverName} de ${clientName} ha finalizado su jornada. ¡Buen trabajo!`,
                icon: '/erick-go-logo.png',
                data: { url: '/admin-dashboard' }
            };
        }

        const adminIds = admins.map(admin => admin.userId);

        try {
            const response = await fetch('/.netlify/functions/send-notification', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userIds: adminIds,
                    payload: notificationPayload,
                    clientId: selectedClientId // Enviamos el clientId para empleados multi-empresa
                }),
            });

            if (!response.ok) {
                throw new Error(`Error ${response.status}: ${response.statusText}`);
            }

            console.log(`Notificación de viaje ${status} enviada a ${admins.length} administrador(es).`);
        } catch (error) {
            console.error(`Error al enviar notificación de viaje ${status} a administradores:`, error);
        }
    };

    // Función para convertir hora de formato 24h a 12h con AM/PM
    const formatTime12Hour = (time24) => {
        if (!time24) return '';
        if (time24.includes('AM') || time24.includes('PM')) return time24;
        const [hours, minutes] = time24.split(':');
        const hour = parseInt(hours, 10);
        const period = hour >= 12 ? 'PM' : 'AM';
        const hour12 = hour % 12 || 12;
        return `${hour12.toString().padStart(2,'0')}:${minutes} ${period}`;
    };

    // Función para formatear la fecha con día de la semana
    const formatDateWithDayOfWeek = () => {
        const today = new Date();
        const daysOfWeek = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
        const dayOfWeek = daysOfWeek[today.getDay()];
        const day = String(today.getDate()).padStart(2, '0');
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const year = today.getFullYear();
        return `${dayOfWeek} ${day}/${month}/${year}`;
    };

    // Función para obtener el mensaje de cierre
    const getClosingMessage = () => {
        if (availableEmployees.length === 0) {
            return "No tiene empleados disponibles para hoy";
        } else {
            if (driverClosingTime || companyClosingTime) {
                return `Hora de cierre: ${formatTime12Hour(driverClosingTime || companyClosingTime)}`;
            } else {
                return "En espera de que el encargado determine la hora de cierre";
            }
        }
    };

    // EFECTO1: Lógica de selección de empresa
    useEffect(() => {
        if (!user || hasInitialized.current) return;
        const initializeDriver = async () => {
            console.log("DriverDashboard: Inicializando para el conductor:", user.uid);
            console.log("Datos del conductor:", user);
            setLoading(true);
            try {
                const driverVinculos = await fetchUserVinculos(user.uid);
                console.log("Vínculos del conductor obtenidos:", driverVinculos);
                
                driverVinculos.forEach(vinculo => {
                    console.log(`Vínculo para empresa ${vinculo.clientId}:`, vinculo);
                    console.log(`- Zonas asignadas:`, vinculo.zonasAsignadas || "No definidas");
                    console.log(`- Grupos de zonas:`, vinculo.gruposZonas || "No definidos");
                });
                
                setVinculos(driverVinculos);
                if (driverVinculos.length === 0) return;
                const isCurrentSelectionValid = selectedClientId && driverVinculos.some(v => v.clientId === selectedClientId);
                if (isCurrentSelectionValid) {
                    console.log("DriverDashboard: La empresa seleccionada es válida. Continuando.");
                } else {
                    if (driverVinculos.length === 1) {
                        const onlyClientId = driverVinculos[0].clientId;
                        useAuthStore.getState().setSelectedClient(onlyClientId);
                    } else {
                        navigate('/select-company');
                        setLoading(false);
                        return;
                    }
                }
            } catch (error) {
                console.error("DriverDashboard: Error durante la inicialización:", error);
            } finally {
                setLoading(false);
                hasInitialized.current = true;
            }
        };
        initializeDriver();
    }, [user, selectedClientId, navigate, fetchUserVinculos]);
    
    // Escuchar cambios en las horas de cierre - Optimizado
    useEffect(() => {
        if (!selectedClientId || !user || closingTimesLoaded.current) return;
        
        closingTimesLoaded.current = true;
        
        const unsubscribe = listenToClosingTimeChanges(selectedClientId, (notification) => {
            console.log('Notificación de cambio de hora de cierre recibida:', notification);
            loadClosingTimes();
        });
        
        return () => {
            unsubscribe();
            closingTimesLoaded.current = false;
        };
    }, [selectedClientId, user, listenToClosingTimeChanges]);
    
    // Función para cargar las horas de cierre - Optimizada
    const loadClosingTimes = async () => {
        if (!selectedClientId || !user) return;
        
        try {
            const closingTimes = await getTodayClosingTimes(selectedClientId, user.uid);
            
            if (driverWorkdayComplete) {
                setDriverClosingTime(null);
                setCompanyClosingTime(null);
            } else {
                if (closingTimes.companyClosingTime) {
                    setCompanyClosingTime(closingTimes.companyClosingTime);
                    setDriverClosingTime(closingTimes.driverClosingTime);
                } else if (closingTimes.driverClosingTime) {
                    setDriverClosingTime(closingTimes.driverClosingTime);
                    setCompanyClosingTime(null);
                } else {
                    setDriverClosingTime(null);
                    setCompanyClosingTime(null);
                }
            }
        } catch (error) {
            console.error('Error al cargar las horas de cierre:', error);
        }
    };
    
    const loadDashboardData = async () => {
        if (!selectedClientId) return;
        
        console.log("DriverDashboard: Cargando datos del viaje para la empresa:", selectedClientId);
        
        setDataLoaded(false);
        setDriverClosingTime(null);
        setCompanyClosingTime(null);
        setHasRegisteredEmployees(false);
        setAvailableEmployees([]);
        setLoading(true);
        
        try {
            const [usersData, asistenciaData, zonesData] = await Promise.all([
                fetchUsers(),
                fetchTodayAsistencias(selectedClientId),
                fetchZones(selectedClientId)
            ]);
            
            setAllUsers(usersData);
            setTodayAsistencias(asistenciaData);
            setAllZones(zonesData);
            
            const hasEmployees = asistenciaData.length > 0;
            setHasRegisteredEmployees(hasEmployees);
            console.log(`Hay ${asistenciaData.length} empleados registrados hoy`);
            
            await loadClosingTimes();
        } catch (error) {
            console.error("Error al cargar los datos del conductor:", error);
        } finally {
            setLoading(false);
            setDataLoaded(true);
            setDriverWorkdayComplete(false);
        }
    };

    // EFECTO 2: Carga los datos del dashboard - Optimizado
    useEffect(() => {
        if (selectedClientId && vinculos.length > 0 && !dataLoaded) {
            loadDashboardData();
        }
    }, [selectedClientId, vinculos.length]);
    
    // EFECTO 3: Lógica de filtrado de empleados disponibles - Mejorado
    useEffect(() => {
        if (loading || !selectedClientId || !dataLoaded || !vinculos.length) return;
        
        console.log("=== INICIANDO FILTRADO DE EMPLEADOS ===");
        console.log("Total de asistencias hoy:", todayAsistencias.length);
        
        const driverVinculos = vinculos.filter(v => 
            v.clientId === selectedClientId && 
            v.rol === 'conductor' && 
            v.activo !== false
        );
        
        console.log("Vínculos de conductor activos para esta empresa:", driverVinculos);
        
        if (driverVinculos.length === 0) {
            console.log("No se encontraron vínculos de conductor activos para esta empresa");
            setAvailableEmployees([]);
            return;
        }
        
        const driverVinculo = driverVinculos[0];
        console.log("Vínculo del conductor seleccionado:", driverVinculo);
        
        let assignedZones = driverVinculo.zonasAsignadas || [];
        
        if (assignedZones.length === 0 && driverVinculo.gruposZonas && driverVinculo.gruposZonas.length > 0) {
            console.log("No hay zonas asignadas directamente, pero hay grupos de zonas. Extrayendo zonas de los grupos...");
            driverVinculo.gruposZonas.forEach(grupo => {
                if (grupo.zonas && Array.isArray(grupo.zonas)) {
                    assignedZones = [...assignedZones, ...grupo.zonas];
                }
            });
            console.log("Zonas extraídas de grupos:", assignedZones);
        }
        
        if (assignedZones.length === 0) {
            console.error("PROBLEMA: El conductor no tiene zonas asignadas ni en grupos");
            console.error("ID del conductor:", user.uid);
            console.error("ID de la empresa:", selectedClientId);
            console.log("Zonas disponibles en la empresa:", allZones.map(z => `${z.nombre} (${z.id})`));
            setAvailableEmployees([]);
            return;
        }
        
        console.log("Zonas asignadas al conductor:", assignedZones);
        console.log("Número de zonas asignadas:", assignedZones.length);
        
        const zoneMap = new Map();
        allZones.forEach(zone => {
            zoneMap.set(zone.id, zone.nombre);
        });
        
        const employeesForMe = todayAsistencias.filter(asistencia => {
            console.log(`\n--- Evaluando empleado: ${asistencia.empleadoNombre} ---`);
            console.log(`ID de empleado: ${asistencia.empleadoId}`);
            console.log(`Zona del empleado: ${asistencia.zona}`);
            console.log(`Nombre de la zona: ${zoneMap.get(asistencia.zona) || 'No encontrada'}`);
            console.log(`ID de cliente del empleado: ${asistencia.clientId}`);
            console.log(`ID de cliente seleccionado: ${selectedClientId}`);
            console.log(`Estado completado: ${asistencia.completado}`);
            
            const isCorrectZone = assignedZones.includes(asistencia.zona);
            console.log(`¿Zona correcta? ${isCorrectZone}`);
            
            if (!isCorrectZone) {
                console.log("Empleado descartado: zona no asignada al conductor");
                return false;
            }
            
            const isCorrectCompany = asistencia.clientId === selectedClientId;
            console.log(`¿Empresa correcta? ${isCorrectCompany}`);
            
            if (!isCorrectCompany) {
                console.log("Empleado descartado: empresa no coincide");
                return false;
            }
            
            const isNotCompleted = !asistencia.completado;
            console.log(`¿No completado? ${isNotCompleted}`);
            
            if (!isNotCompleted) {
                console.log("Empleado descartado: ya fue completado");
                return false;
            }
            
            console.log("Empleado APROBADO para el conductor");
            return true;
        });
        
        console.log(`\n=== RESULTADO DEL FILTRADO ===`);
        console.log(`Empleados disponibles para el conductor: ${employeesForMe.length}`);
        if (employeesForMe.length > 0) {
            console.log("Lista de empleados disponibles:");
            employeesForMe.forEach(emp => {
                const zoneName = zoneMap.get(emp.zona) || emp.zona;
                console.log(`- ${emp.empleadoNombre} (Zona: ${zoneName})`);
            });
        } else {
            console.log("No se encontraron empleados disponibles. Posibles causas:");
            console.log("1. Las zonas de los empleados no coinciden con las zonas asignadas al conductor");
            console.log("2. Los empleados ya fueron completados");
            console.log("3. Los empleados pertenecen a otra empresa");
        }
        
        setAvailableEmployees(employeesForMe);
    }, [allUsers, todayAsistencias, user?.uid, loading, selectedClientId, vinculos, dataLoaded, allZones]);

    // EFECTO 4: Procesamiento de grupos - Optimizado
    useEffect(() => {
        if (tripMode !== 'grouped' || availableEmployees.length === 0) {
            setGroupedEmployees([]);
            return;
        }
        
        const processGroups = async () => {
            setLoadingGroups(true);
            try {
                const driverVinculos = vinculos.filter(v => 
                    v.clientId === selectedClientId && 
                    v.rol === 'conductor' && 
                    v.activo !== false
                );
                
                if (driverVinculos.length === 0) {
                    console.error("No se encontró el vínculo del conductor para la empresa seleccionada.");
                    setUserGroups([]);
                    setGroupedEmployees([]);
                    return;
                }
                
                const driverVinculo = driverVinculos[0];
                const groups = driverVinculo.gruposZonas || [];
                setUserGroups(groups);

                if (groups.length === 0) {
                    setGroupedEmployees([]);
                    return;
                }
                
                const distributed = groups.map(group => {
                    const employeesInGroup = availableEmployees.filter(emp => 
                        group.zonas.includes(emp.zona)
                    );
                    return { ...group, employees: employeesInGroup };
                });
                setGroupedEmployees(distributed);
            } catch (error) {
                console.error("Error al procesar los grupos de viajes:", error);
            } finally {
                setLoadingGroups(false);
            }
        };
        
        processGroups();
    }, [tripMode, availableEmployees, vinculos, selectedClientId]);

    const handleReportArrival = async (employeeId) => {
        if (!activeTripId) {
            alert("Error: No hay un viaje activo para reportar.");
            return;
        }
        try {
            // CORRECCIÓN: Cambiar const a let para permitir reasignación
            let asistencia = todayAsistencias.find(a => a.id === employeeId);
            
            if (!asistencia) {
                // Intento por empleadoId si id falla (a veces los datos vienen mezclados)
                const asistenciaByEmpId = todayAsistencias.find(a => a.empleadoId === employeeId);
                if (asistenciaByEmpId) {
                    asistencia = asistenciaByEmpId;
                } else {
                    console.error("No se encontró el registro de asistencia para el empleado:", employeeId);
                    alert("Error: No se encontró el registro de asistencia.");
                    return;
                }
            }

            setDroppedOffEmployees(prev => [...prev, employeeId]);
            const tripRef = doc(db, 'trips', activeTripId);
            await updateDoc(tripRef, { empleadosEntregados: arrayUnion(employeeId) });

            await markAsistenciaAsCompleted(asistencia.id);

            setAvailableEmployees(prev => prev.filter(emp => emp.empleadoId !== employeeId));
            setTodayAsistencias(prev => 
                prev.map(a => a.id === asistencia.id ? { ...a, completado: true } : a)
            );
            
            console.log(`Empleado ${employeeId} marcado como entregado y completado.`);
            setSuccessMessage('¡Llegada reportada con éxito!');
            setTimeout(() => setSuccessMessage(''), 5000);

            // --- ENVIAR NOTIFICACIÓN INDIVIDUAL DE VIAJE COMPLETADO ---
            const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
            
            if (!isDev) {
                console.log(`>>> Enviando notificación de viaje completado a ${asistencia.empleadoNombre}...`);
                const notificationPayload = {
                    title: '¡Viaje Completado!',
                    body: `¡Hola, ${asistencia.empleadoNombre}! Tu viaje ha sido completado exitosamente. ¡Buen día!`,
                    icon: '/erick-go-logo.png',
                    data: {
                        url: '/empleado-dashboard'
                    }
                };

                try {
                    const response = await fetch('/.netlify/functions/send-notification', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            userIds: [employeeId],
                            payload: notificationPayload,
                            clientId: selectedClientId
                        }),
                    });

                    if (!response.ok) {
                        throw new Error(`Error ${response.status}: ${response.statusText}`);
                    }

                    console.log(`Notificación de viaje completado enviada a ${asistencia.empleadoNombre}`);
                } catch (error) {
                    console.error(`Error al enviar notificación de viaje completado a ${asistencia.empleadoNombre}:`, error);
                }
            } else {
                console.log('[MODO DESARROLLO] Notificación de viaje completado omitida.');
            }

        } catch (error) {
            console.error("Error al reportar la llegada:", error);
            alert("Hubo un error al reportar la llegada. Por favor, intenta de nuevo.");
        }
    };

    const handleEndWorkday = async () => {
        setTripStarted(false);
        setActiveTripId(null);
        setDroppedOffEmployees([]);
        setTripMode(null);

        try {
            const driversWithPendingEmployees = await fetchDriversWithPendingEmployees(selectedClientId, user.uid);
            console.log(`Conductores con empleados pendientes: ${driversWithPendingEmployees.length}`);
            
            if (driversWithPendingEmployees.length === 0) {
                await clearAllClosingTimesForToday(selectedClientId);
                console.log("Todos los viajes han finalizado. Eliminando todas las horas de cierre del día.");
            } else {
                await clearTodayClosingTimeForDriver(selectedClientId, user.uid);
                console.log(`Hay otros conductores con empleados pendientes. Eliminando solo la hora de cierre del conductor ${user.uid}.`);
            }
            
            await notifyClosingTimeChange(selectedClientId, user.uid, null);
            
            if (activeTripId) {
                const tripRef = doc(db, 'trips', activeTripId);
                await updateDoc(tripRef, {
                    estado: 'finalizado',
                    fechaFin: new Date()
                });
            }
            
            setDriverWorkdayComplete(true);
            setDriverClosingTime(null);
            setCompanyClosingTime(null);

            setSuccessMessage('¡Tu jornada ha sido finalizada. ¡Buen trabajo!');
            
            // --- NUEVO: NOTIFICAR A ADMINISTRADORES QUE LA JORNADA HA FINALIZADO ---
            console.log(">>> Enviando notificación de fin de jornada a administradores...");
            await sendTripStatusToAdmins('ended', user.nombre, 0);
            console.log(">>> Notificación de fin de jornada enviada.");
        } catch (error) {
            console.error("Error al finalizar la jornada:", error);
            alert("Hubo un error al finalizar la jornada. Intenta de nuevo.");
        }
        
        setTimeout(() => setSuccessMessage(''), 3000);
    };

    const handleStartGroupedTrip = async (employeesForThisTrip) => {
        if (!user?.uid || employeesForThisTrip.length === 0) {
            alert("No se puede iniciar el viaje. No hay empleados en este grupo.");
            return;
        }
        console.log(">>> INICIANDO PROCESO DE VIAJE. isStartingTrip = true");
        setIsStartingTrip(true);
        try {
            console.log(">>> PASO 1: Preparando datos del viaje...");
            const tripData = {
                conductorId: user.uid,
                conductorNombre: user.nombre,
                empleadosIds: employeesForThisTrip.map(emp => emp.empleadoId),
                estado: 'en_progreso',
                fechaInicio: Timestamp.now(), // CORRECCIÓN: Usar Timestamp.now()
                clientId: selectedClientId,
                empleadosEntregados: [],
                horaCierre: driverClosingTime || companyClosingTime
            };
            console.log(">>> PASO 2: Llamando a addTrip. Esto puede tardar...");
            const tripDocRef = await addDoc(collection(db, 'trips'), tripData);
            console.log(">>> PASO 3: addTrip ha respondido. Referencia:", tripDocRef);

            console.log(">>> PASO 4: Actualizando estado local con el ID del viaje:", tripDocRef.id);
            setActiveTripId(tripDocRef.id);
            setDroppedOffEmployees([]);
            
            // CORRECCIÓN: Agregamos el viaje al estado local 'trips' aunque solo usemos activeTripId
            const newTrip = { id: tripDocRef.id, ...tripData };
            setTrips(prev => [...prev, newTrip]);
            setTripStarted(true);
            setSuccessMessage(`¡Viaje iniciado para ${employeesForThisTrip.length} empleados!`);
            
            // --- ENVIAR NOTIFICACIONES A LOS EMPLEADOS ---
            console.log(">>> PASO 5: Enviando notificaciones a los empleados...");
            await sendTripStartedNotification(employeesForThisTrip);
            console.log(">>> PASO 6: Notificaciones a empleados enviadas.");

            // --- NUEVO: NOTIFICAR A ADMINISTRADORES QUE EL VIAJE HA INICIADO ---
            console.log(">>> PASO 7: Enviando notificación de inicio de viaje a administradores...");
            await sendTripStatusToAdmins('started', user.nombre, employeesForThisTrip.length);
            console.log(">>> PASO 8: Notificación a administradores enviada.");

            setTimeout(() => setSuccessMessage(''), 3000);
            console.log(">>> PASO 9: Proceso de inicio de viaje completado.");

        } catch (error) {
            console.error(">>> ERROR EN EL PROCESO DE VIAJE:", error);
            alert("Hubo un error al iniciar el viaje. Por favor, intenta de nuevo.");
        } finally {
            console.log(">>> FINALIZANDO: isStartingTrip = false");
            setIsStartingTrip(false);
        }
    };

    const handleStartSingleTrip = async () => {
        handleStartGroupedTrip(availableEmployees);
    };

    const handleModeChange = (event, newMode) => {
        if (newMode !== null) {
            setTripMode(newMode);
            setTripStarted(false);
        }
    };

    if (loading) {
        return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>;
    }
    
    if (vinculos.length === 0) {
        return (<Box sx={{ width: '100%' }}><Alert severity="error">No tienes empresas asignadas. Por favor, contacte al administrador.</Alert></Box>);
    }

    const renderActiveTripList = (employees) => {
        return (
            <List sx={{ mt: 2 }}>
                {employees.map((emp) => {
                    const isDroppedOff = droppedOffEmployees.includes(emp.empleadoId);
                    const zoneObject = allZones.find(z => z.id === emp.zona);
                    const zoneNameToShow = zoneObject ? zoneObject.nombre : emp.zona;
                    
                    return (
                        <Paper key={emp.id} sx={{ p: 2, mb: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: isDroppedOff ? 0.6 : 1 }}>
                            <ListItemText 
                                primary={emp.empleadoNombre || 'Sin nombre'} 
                                secondary={`Zona: ${zoneNameToShow}`}
                                sx={{ textDecoration: isDroppedOff ? 'line-through' : 'none' }}
                            />
                            <Button
                                variant={isDroppedOff ? "contained" : "outlined"}
                                color="success"
                                startIcon={<DoneIcon />}
                                onClick={() => handleReportArrival(emp.empleadoId)}
                                disabled={isDroppedOff}
                            >
                                {isDroppedOff ? 'Completado' : 'Reportar Llegada'}
                            </Button>
                        </Paper>
                    );
                })}
            </List>
        );
    };

    return (
        <Box sx={{ width: '100%' }}>
            <Typography variant="h4" gutterBottom>Panel del Conductor - Erick Go</Typography>
            {successMessage && <Alert severity="success" sx={{ mb: 2 }}>{successMessage}</Alert>}
            
            {dataLoaded && (
                <>
                    {!driverWorkdayComplete ? (
                        <>
                            {(driverClosingTime || companyClosingTime) && (
                                <Card sx={{ mb: 2, backgroundColor: '#f5f5f5' }}>
                                    <CardContent sx={{ display: 'flex', alignItems: 'center' }}>
                                        <AccessTimeIcon sx={{ mr: 2, color: 'primary.main' }} />
                                        <Box>
                                            <Typography variant="h6">
                                                Hora de cierre - {formatDateWithDayOfWeek()}:
                                            </Typography>
                                            <Typography variant="h5" color="primary.main">
                                                {formatTime12Hour(driverClosingTime || companyClosingTime)}
                                            </Typography>
                                            <Typography variant="body2" color="text.secondary">
                                                {availableEmployees.length > 0 
                                                    ? "Planifica tus viajes para recoger a los empleados antes de esta hora."
                                                    : "Aunque no tienes empleados asignados hoy, esta es tu hora de cierre registrada."
                                                }
                                            </Typography>
                                        </Box>
                                    </CardContent>
                                </Card>
                            )}
                            
                            {!driverClosingTime && !companyClosingTime && (
                                <Alert severity="warning" sx={{ mb: 2 }}>
                                    {getClosingMessage()}
                                </Alert>
                            )}
                        </>
                    ) : (
                        <Alert severity="success" sx={{ mb: 2 }}>
                            ¡Tu jornada ha sido finalizada exitosamente! Nos vemos Mañana.
                        </Alert>
                    )}
                </>
            )}
            
            <Paper sx={{ p: 3, mt: 2 }}>
                <Typography variant="h6">Hola, {user?.nombre || 'Conductor'}!</Typography>
                
                {!driverWorkdayComplete ? (
                    !tripStarted ? (
                        <>
                            <Typography variant="body1" sx={{ mt: 2, display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
                                Tienes 
                                <Typography 
                                    component="span" 
                                    sx={{ 
                                        mx: 1, 
                                        fontSize: '2.5rem', 
                                        fontWeight: 'bold', 
                                        color: 'success.main' 
                                    }}
                                >
                                    {availableEmployees.length}
                                </Typography> 
                                empleados disponibles para hoy. Elige cómo deseas organizar los viajes.
                            </Typography>
                            <Box sx={{ mt: 3, display: 'flex', justifyContent: 'center' }}>
                                <ToggleButtonGroup value={tripMode} exclusive onChange={handleModeChange} aria-label="modo de viaje" color="secondary">
                                    <ToggleButton value="single" aria-label="viaje único"><ViewListIcon sx={{ mr: 1 }} />Un único viaje</ToggleButton>
                                    <ToggleButton value="grouped" aria-label="viajes por grupos"><CategoryIcon sx={{ mr: 1 }} />Viajes por grupos</ToggleButton>
                                </ToggleButtonGroup>
                            </Box>
                            <Divider sx={{ my: 3 }} />

                            {tripMode === 'single' && (
                                <>
                                    <Typography variant="h6">Modo: Viaje Único</Typography>
                                    <Button 
                                        variant="contained" 
                                        startIcon={isStartingTrip ? <CircularProgress size={20} color="inherit" /> : <PlayArrowIcon />} 
                                        onClick={handleStartSingleTrip} 
                                        disabled={loading || availableEmployees.length === 0 || isStartingTrip} 
                                        sx={{ mt: 2, mb: 2 }}
                                    >
                                        {isStartingTrip ? 'Iniciando...' : `Iniciar Viaje (${availableEmployees.length} empleados)`}
                                    </Button>
                                </>
                            )}

                            {tripMode === 'grouped' && (
                                <>
                                    <Typography variant="h6">Modo: Viajes por Grupos de Zonas</Typography>
                                    {loadingGroups ? <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}><CircularProgress /></Box> :
                                    userGroups.length === 0 ? <Alert severity="warning" sx={{ mt: 2 }}>No tienes grupos de zonas configurados para esta empresa.</Alert> :
                                    groupedEmployees.map((group) => (
                                        <Paper key={group.id} elevation={2} sx={{ p: 2, mt: 2, border: '1px solid #e0e0e0' }}>
                                            <Typography variant="subtitle1" fontWeight="bold">{group.nombre} ({group.employees.length} empleados)</Typography>
                                            <Button 
                                                variant="contained" 
                                                size="small" 
                                                startIcon={isStartingTrip ? <CircularProgress size={20} color="inherit" /> : <PlayArrowIcon />} 
                                                onClick={() => handleStartGroupedTrip(group.employees)} 
                                                disabled={group.employees.length === 0 || isStartingTrip} 
                                                sx={{ mt: 1 }}
                                            >
                                                {isStartingTrip ? 'Iniciando...' : 'Iniciar Viaje para este Grupo'}
                                            </Button>
                                        </Paper>
                                    ))
                                    }
                                </>
                            )}
                        </>
                    ) : (
                        <>
                            <Typography variant="h5" sx={{ mb: 2, color: 'primary.main' }}>Viaje en Curso</Typography>
                            <Typography variant="body2" color="text.secondary">Reporta la llegada de cada empleado a su destino.</Typography>
                            <Divider sx={{ my: 2 }} />
                            {tripMode === 'single' && renderActiveTripList(availableEmployees)}
                            {tripMode === 'grouped' && groupedEmployees.map((group) => (
                                <Box key={group.id} sx={{mb: 3}}>
                                    <Typography variant="h6" sx={{mb:1}}>{group.nombre}</Typography>
                                    {renderActiveTripList(group.employees)}
                                </Box>
                            ))}
                            <Divider sx={{ my: 2 }} />
                            <Box sx={{ textAlign: 'center' }}>
                                <Button 
                                    variant="contained" 
                                    color="error" 
                                    startIcon={<StopIcon />} 
                                    onClick={handleEndWorkday}
                                    disabled={availableEmployees.length > 0}
                                >
                                    Finalizar Jornada
                                </Button>
                            </Box>
                        </>
                    )
                ) : (
                    <Box sx={{ textAlign: 'center', py: 4 }}>
                        <Typography variant="h6" color="text.secondary">
                            Tu jornada de hoy ha finalizado. Gracias por tu trabajo.
                        </Typography>
                    </Box>
                )}
            </Paper>
        </Box>
    );
}