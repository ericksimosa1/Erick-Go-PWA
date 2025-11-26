// src/pages/AdminDashboard.jsx
import React, { useState, useEffect, useCallback } from 'react';
import {
    Box, Tab, Tabs, Typography, Button, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, Paper, Dialog, DialogTitle,
    DialogContent, DialogActions, TextField, IconButton, Alert, FormControl, InputLabel, Select, MenuItem, Checkbox, ListItem, ListItemText, List, DialogContentText, Divider, CircularProgress, Card, CardContent, CardActions, Grid, Accordion, AccordionSummary, AccordionDetails, Chip
} from '@mui/material';
import { 
    Edit, Delete, Add as AddIcon, CleaningServices as CleaningServicesIcon, Build as BuildIcon, Warning as WarningIcon, Settings as SettingsIcon, AccessTime as AccessTimeIcon, ExpandMore as ExpandMoreIcon, People as PeopleIcon, Group as GroupIcon, Schedule as ScheduleIcon, PersonOff as PersonOffIcon, Send as SendIcon, CalendarToday as CalendarTodayIcon, NotificationsActive as NotificationsActiveIcon 
} from '@mui/icons-material';
import { useFirestore } from '../hooks/useFirestore';
import { useAuthStore } from '../store/authStore';
import RegisterUserModal from '../components/RegisterUserModal';
import NotificationSettings from '../components/NotificationSettings';

const TabPanel = (props) => {
    const { children, value, index, ...other } = props;
    return (
        <div 
            role="tabpanel" 
            hidden={value !== index} 
            {...other}
            style={{ 
                overflow: 'auto',
                height: 'calc(100vh - 160px)',
                width: '100%'
            }}
        >
            {value === index && <Box sx={{ p: 3, width: '100%' }}>{children}</Box>}
        </div>
    );
};

export default function AdminDashboard() {
    const [tabValue, setTabValue] = useState(0);
    const { user: loggedInUser, selectedClientId, clients, setClients } = useAuthStore();
    const {
        fetchUsersByClient, updateUserVinculo, deactivateUserVinculo,
        fetchClients, addClient, updateClient, deleteClient,
        fetchZones, addZone, updateZone, deleteZone,
        updateUser, deleteUsersByRole, createTestData, 
        fetchGlobalConfig, updateGlobalConfig,
        setClosingPerson, getTodayClosingPerson,
        getTodayClosingTime,
        fetchTodayAsistencias,
        deleteEmployeeAttendanceForToday,
        fetchWeeklyClosingConfig,
        updateWeeklyClosingConfig,
        getTodayClosingPersonFromWeeklyConfig,
        convertTo12HourFormat,
        convertTo24HourFormat
    } = useFirestore();

    const [users, setUsers] = useState([]);
    const [editUserDialog, setEditUserDialog] = useState({ open: false, user: null, vinculoId: null });
    const [registerModalOpen, setRegisterModalOpen] = useState(false);
    const [zones, setZones] = useState([]); // <-- LÍNEA CLAVE 1: Declaración de 'zones' y 'setZones'
    const [isLoading, setIsLoading] = useState(false);
    const [todayAsistencias, setTodayAsistencias] = useState([]);

    const [clientDialog, setClientDialog] = useState({ open: false, client: null, isEdit: false });
    const [zoneDialog, setZoneDialog] = useState({ open: false, zone: null, isEdit: false });

    const [deleteDialog, setDeleteDialog] = useState({ open: false, role: null });
    const [createTestDataDialog, setCreateTestDataDialog] = useState({ open: false });
    const [isProcessing, setIsProcessing] = useState(false);
    
    const [globalConfig, setGlobalConfig] = useState({
        loginFooterText: 'Copyright © 2025 Desarrollado por Erick Go\nerickgoapp@gmail.com - 0424 3036024'
    });
    const [configDialog, setConfigDialog] = useState({ open: false });
    const [configLoading, setConfigLoading] = useState(false);

    const [closingPersonDialog, setClosingPersonDialog] = useState({ open: false });
    const [selectedClosingPerson, setSelectedClosingPerson] = useState('');
    const [todayClosingPerson, setTodayClosingPerson] = useState(null);
    const [closingPersonLoading, setClosingPersonLoading] = useState(false);

    const [closingTime, setClosingTime] = useState(null);

    const [notificationTitle, setNotificationTitle] = useState('');
    const [notificationBody, setNotificationBody] = useState('');
    const [targetAudience, setTargetAudience] = useState('all');
    const [selectedTargetUser, setSelectedTargetUser] = useState('');
    const [isSendingNotification, setIsSendingNotification] = useState(false);
    const [notificationSuccess, setNotificationSuccess] = useState('');

    const [weeklyClosingConfigDialog, setWeeklyClosingConfigDialog] = useState({ open: false });
    const [weeklyClosingConfig, setWeeklyClosingConfig] = useState({
        lunes: { vinculoId: null, userId: null, userName: null },
        martes: { vinculoId: null, userId: null, userName: null },
        miercoles: { vinculoId: null, userId: null, userName: null },
        jueves: { vinculoId: null, userId: null, userName: null },
        viernes: { vinculoId: null, userId: null, userName: null },
        sabado: { vinculoId: null, userId: null, userName: null },
        domingo: { vinculoId: null, userId: null, userName: null }
    });
    const [weeklyConfigLoading, setWeeklyConfigLoading] = useState(false);

    const [isAppReady, setIsAppReady] = useState(false);

    const sortUsersByRole = (usersList) => {
        return usersList.sort((a, b) => {
            const roleA = a.userData.rol || '';
            const roleB = b.userData.rol || '';
            const roleOrder = { 'conductor': 1, 'empleado': 2 };
            const orderA = roleOrder[roleA] || 99;
            const orderB = roleOrder[roleB] || 99;
            if (orderA === orderB) {
                return a.userData.nombre.localeCompare(b.userData.nombre || '');
            }
            return orderA - orderB;
        });
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            setIsAppReady(true);
        }, 1000);
        return () => clearTimeout(timer);
    }, []);

    useEffect(() => {
        if (!isAppReady) return;
        
        const loadGlobalConfig = async () => {
            try {
                const config = await fetchGlobalConfig();
                if (config) {
                    setGlobalConfig(config);
                }
            } catch (error) {
                console.error("Error al cargar configuración global:", error);
            }
        };
        
        loadGlobalConfig();
    }, [isAppReady, fetchGlobalConfig]);

    useEffect(() => {
        if (!isAppReady) return;
        const fetchData = async () => {
            setIsLoading(true);
            try {
                if (selectedClientId) {
                    const usersData = await fetchUsersByClient(selectedClientId);
                    const zonesData = await fetchZones(selectedClientId); // <-- LÍNEA CLAVE 2: Uso de 'fetchZones'
                    const closingPerson = await getTodayClosingPersonFromWeeklyConfig(selectedClientId);
                    const todayClosingTime = await getTodayClosingTime(selectedClientId);
                    const asistenciaData = await fetchTodayAsistencias(selectedClientId);
                    const weeklyConfig = await fetchWeeklyClosingConfig(selectedClientId);

                    setUsers(sortUsersByRole(usersData));
                    setZones(zonesData); // <-- LÍNEA CLAVE 3: Uso de 'setZones'
                    setTodayClosingPerson(closingPerson);
                    setClosingTime(todayClosingTime);
                    setTodayAsistencias(asistenciaData);
                    setWeeklyClosingConfig(weeklyConfig);
                } else {
                    setUsers([]);
                    setZones([]); // <-- LÍNEA CLAVE 4: Uso de 'setZonas'
                    setTodayClosingPerson(null);
                    setClosingTime(null);
                    setTodayAsistencias([]);
                    setWeeklyClosingConfig({
                        lunes: { vinculoId: null, userId: null, userName: null },
                        martes: { vinculoId: null, userId: null, userName: null },
                        miercoles: { vinculoId: null, userId: null, userName: null },
                        jueves: { vinculoId: null, userId: null, userName: null },
                        viernes: { vinculoId: null, userId: null, userName: null },
                        sabado: { vinculoId: null, userId: null, userName: null },
                        domingo: { vinculoId: null, userId: null, userName: null }
                    });
                }
            } catch (error) {
                console.error("AdminDashboard: Error al cargar los datos iniciales:", error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, [isAppReady, selectedClientId, fetchUsersByClient, fetchZones, getTodayClosingPersonFromWeeklyConfig, getTodayClosingTime, fetchTodayAsistencias, fetchWeeklyClosingConfig]);

    useEffect(() => {
        setTabValue(0);
    }, [selectedClientId]);

    useEffect(() => {
        if (editUserDialog.open) {
            console.log("Cambiando de empresa. Cerrando diálogo de edición para evitar inconsistencias.");
            setEditUserDialog({ open: false, user: null, vinculoId: null });
        }
    }, [selectedClientId]);

    const handleTabChange = (event, newValue) => {
        setTabValue(newValue);
    };

    const handleEditUser = (userFromClick) => {
        console.log(`[handleEditUser] Clic en usuario: ${userFromClick.userData.nombre} (Email: ${userFromClick.userData.correo})`);
        
        const currentUserInState = users.find(u => u.userData.correo === userFromClick.userData.correo);

        if (!currentUserInState) {
            alert("Error: No se pudo encontrar al usuario en la lista actual. Por favor, inténtalo de nuevo.");
            return;
        }

        console.log(`[handleEditUser] Usuario encontrado en el estado actual: ${currentUserInState.userData.nombre} con vinculoId: ${currentUserInState.vinculoId}`);

        const userWithGroups = {
            ...currentUserInState,
            gruposZonas: currentUserInState.gruposZonas || []
        };
        setEditUserDialog({ 
            open: true, 
            user: userWithGroups,
            vinculoId: currentUserInState.vinculoId
        });
    };
    
    const handleSaveUser = async () => {
        try {
            const { user, vinculoId } = editUserDialog;
            
            if (!user || !vinculoId) {
                console.error("Datos de usuario o vinculoId incompletos:", { user, vinculoId });
                alert("Error: Datos de usuario incompletos. No se puede guardar.");
                return;
            }
            
            const gruposZonas = user.gruposZonas || [];
            const zonasAsignadas = user.zonasAsignadas || [];
            
            console.log(`Guardando usuario con vinculoId: ${vinculoId}`);
            
            await updateUserVinculo(vinculoId, { zonasAsignadas, gruposZonas });
            
            setUsers(prevUsers => 
                prevUsers.map(u => 
                    u.vinculoId === vinculoId 
                        ? { ...u, gruposZonas, zonasAsignadas }
                        : u
                )
            );
            
            setEditUserDialog({ open: false, user: null, vinculoId: null });

        } catch (error) {
            console.error("Error al guardar usuario:", error);
            alert("Error al guardar los datos del usuario. Por favor, inténtalo de nuevo.");
        }
    };

    const handleDeleteUser = async (userToDelete) => {
        try {
            if (!userToDelete || !userToDelete.vinculoId) {
                console.error("ID de vínculo de usuario no disponible:", userToDelete);
                alert("Error: No se puede eliminar el usuario. ID de vínculo no disponible.");
                return;
            }
            
            await deactivateUserVinculo(userToDelete.vinculoId);
            
            setUsers(prevUsers => prevUsers.filter(u => u.vinculoId !== userToDelete.vinculoId));

        } catch (error) {
            console.error("Error al eliminar usuario:", error);
            alert("Error al eliminar el usuario. Por favor, inténtalo de nuevo.");
        }
    };

    const handleDeleteAttendance = async (userId, userName) => {
        const confirmRemove = window.confirm(`¿Estás seguro de que quieres quitar la asistencia de hoy para ${userName}? Esta acción no se puede deshacer.`);
        if (!confirmRemove) return;

        setIsLoading(true);
        try {
            const asistencia = todayAsistencias.find(a => a.empleadoId === userId);
            if (!asistencia) {
                throw new Error("No se encontró el registro de asistencia del empleado para hoy.");
            }

            await deleteEmployeeAttendanceForToday(asistencia.id, userId);

            const updatedAsistencias = await fetchTodayAsistencias(selectedClientId);
            setTodayAsistencias(updatedAsistencias);

            alert(`La asistencia de ${userName} ha sido eliminada correctamente.`);
        } catch (error) {
            console.error("Error al eliminar la asistencia:", error);
            alert(`Error al eliminar la asistencia: ${error.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    const handleOpenClientDialog = (client = null, isEdit = false) => {
        setClientDialog({ 
            open: true, 
            client: client ? { ...client } : { nombre: '', direccion: '', telefono: '' }, 
            isEdit 
        });
    };
    
    const handleSaveClient = async () => {
        try {
            const { client, isEdit } = clientDialog;
            if (!client || !client.nombre) {
                alert("Por favor, introduce un nombre para el cliente.");
                return;
            }
            
            const clientData = { nombre: client.nombre, direccion: client.direccion || '', telefono: client.telefono || '' };

            if (isEdit) {
                if (!client.id) {
                    alert("Error: ID de cliente no disponible para editar.");
                    return;
                }
                await updateClient(client.id, clientData);
                const updatedClient = { ...client, ...clientData };
                
                const updatedClients = clients.map(c => c.id === client.id ? updatedClient : c);
                setClients(updatedClients);
            } else {
                await addClient(clientData);
                const updatedClients = await fetchClients();
                setClients(updatedClients);
            }
            
            setClientDialog({ open: false, client: null, isEdit: false });

        } catch (error) {
            console.error("Error al guardar cliente:", error);
            alert("Error al guardar el cliente. Por favor, inténtalo de nuevo.");
        }
    };
    
    const handleDeleteClient = async (clientId) => {
        try {
            if (!clientId) {
                alert("Error: ID de cliente no disponible para eliminar.");
                return;
            }
            
            await deleteClient(clientId);
            
            const updatedClients = clients.filter(c => c.id !== clientId);
            setClients(updatedClients);

        } catch (error) {
            console.error("Error al eliminar cliente:", error);
            alert("Error al eliminar el cliente. Por favor, inténtalo de nuevo.");
        }
    };

    const handleOpenZoneDialog = (zone = null, isEdit = false) => {
        setZoneDialog({ open: true, zone, isEdit });
    };
    
    const handleSaveZone = async () => {
        try {
            const { zone, isEdit } = zoneDialog;
            if (!zone || !zone.nombre) {
                alert("Por favor, introduce un nombre para la zona.");
                return;
            }
            
            if (!selectedClientId) {
                alert("Error: No hay una empresa seleccionada. No se puede guardar la zona.");
                return;
            }
            
            const zoneData = { nombre: zone.nombre, clientId: selectedClientId };
            
            if (isEdit) {
                if (!zone.id) {
                    alert("Error: ID de zona no disponible para editar.");
                    return;
                }
                await updateZone(zone.id, zoneData);
                setZones(prevZones => prevZones.map(z => z.id === zone.id ? { ...z, ...zoneData } : z));
            } else {
                await addZone(zoneData);
                const updatedZones = await fetchZones(selectedClientId);
                setZones(updatedZones);
            }
            
            setZoneDialog({ open: false, zone: null, isEdit: false });

        } catch (error) {
            console.error("Error al guardar zona:", error);
            alert("Error al guardar la zona. Por favor, inténtalo de nuevo.");
        }
    };
    
    const handleDeleteZone = async (zoneId) => {
        try {
            if (!zoneId) {
                alert("Error: ID de zona no disponible para eliminar.");
                return;
            }
            
            await deleteZone(zoneId);

            setZones(prevZones => prevZones.filter(z => z.id !== zoneId));

        } catch (error) {
            console.error("Error al eliminar zona:", error);
            alert("Error al eliminar la zona. Por favor, inténtalo de nuevo.");
        }
    };
    
    const handleAddGroup = () => {
        const currentUser = editUserDialog.user;
        if (!currentUser) return;
        
        const gruposZonas = currentUser.gruposZonas || [];
        const newGroup = {
            id: `group_${Date.now()}`,
            nombre: `Grupo ${gruposZonas.length + 1}`,
            zonas: []
        };
        setEditUserDialog(prev => ({
            ...prev,
            user: { ...prev.user, gruposZonas: [...gruposZonas, newGroup] }
        }));
    };

    const handleDeleteGroup = (groupIdToDelete) => {
        const currentUser = editUserDialog.user;
        if (!currentUser || !currentUser.gruposZonas) return;
        
        const updatedGroups = currentUser.gruposZonas.filter(g => g.id !== groupIdToDelete);
        setEditUserDialog(prev => ({
            ...prev,
            user: { ...prev.user, gruposZonas: updatedGroups }
        }));
    };

    const handleZoneGroupChange = (groupId, zoneId, isChecked) => {
        const currentUser = editUserDialog.user;
        if (!currentUser || !currentUser.gruposZonas) return;
        
        let updatedGroups = [...currentUser.gruposZonas];

        if (isChecked) {
            updatedGroups = updatedGroups.map(group => {
                if (group.id === groupId) {
                    return { ...group, zonas: [...(group.zonas || []), zoneId] };
                }
                return group;
            });

            updatedGroups = updatedGroups.map(group => {
                if (group.id !== groupId) {
                    return { ...group, zonas: (group.zonas || []).filter(id => id !== zoneId) };
                }
                return group;
            });

        } else {
            updatedGroups = updatedGroups.map(group => {
                if (group.id === groupId) {
                    return { ...group, zonas: (group.zonas || []).filter(id => id !== zoneId) };
                }
                return group;
            });
        }
        
        setEditUserDialog(prev => ({
            ...prev,
            user: { ...prev.user, gruposZonas: updatedGroups }
        }));
    };

    const handleZoneCheckboxChange = (zoneId, isChecked) => {
        const currentUser = editUserDialog.user;
        if (!currentUser) return;
        
        const currentZonas = currentUser.zonasAsignadas || [];
        let newZonas;
        
        if (isChecked) {
            newZonas = [...currentZonas, zoneId];
        } else {
            newZonas = currentZonas.filter(id => id !== zoneId);
        }
        
        setEditUserDialog(prev => ({
            ...prev,
            user: { ...prev.user, zonasAsignadas: newZonas }
        }));
    };

    const handleOpenDeleteDialog = (role) => {
        setDeleteDialog({ open: true, role });
    };

    const handleCloseDeleteDialog = () => {
        setDeleteDialog({ open: false, role: null });
    };

    const handleConfirmDelete = async () => {
        const { role } = deleteDialog;
        setIsProcessing(true);
        
        try {
            const result = await deleteUsersByRole(role);
            alert(`Se eliminaron ${result.deletedCount} usuarios con rol "${role}" correctamente.`);
            
            if (role === 'cliente') {
                const updatedClients = await fetchClients();
                setClients(updatedClients);
            }
            
            if (clients.length > 0) {
                for (const client of clients) {
                    try {
                        const updatedUsers = await fetchUsersByClient(client.id);
                        if (client.id === selectedClientId) {
                            setUsers(sortUsersByRole(updatedUsers));
                        }
                    } catch (error) {
                        console.error(`Error al recargar usuarios para la empresa ${client.id}:`, error);
                    }
                }
            }
            
            handleCloseDeleteDialog();
        } catch (error) {
            console.error(`Error al eliminar usuarios con rol "${role}":`, error);
            alert(`Error al eliminar usuarios: ${error.message}`);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleOpenCreateTestDataDialog = () => {
        setCreateTestDataDialog({ open: true });
    };

    const handleCloseCreateTestDataDialog = () => {
        setCreateTestDataDialog({ open: false });
    };

    const handleConfirmCreateTestData = async () => {
        setIsProcessing(true);
        
        try {
            await createTestData();
            alert("Datos de prueba creados correctamente.");
            
            const updatedClients = await fetchClients();
            setClients(updatedClients);
            
            handleCloseCreateTestDataDialog();
        } catch (error) {
            console.error("Error al crear datos de prueba:", error);
            alert(`Error al crear datos de prueba: ${error.message}`);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleOpenConfigDialog = () => {
        setConfigDialog({ open: true });
    };

    const handleCloseConfigDialog = () => {
        setConfigDialog({ open: false });
    };

    const handleSaveConfig = async () => {
        setConfigLoading(true);
        try {
            await updateGlobalConfig(globalConfig);
            alert("Configuración guardada correctamente.");
            setConfigDialog({ open: false });
        } catch (error) {
            console.error("Error al guardar configuración global:", error);
            alert("Error al guardar la configuración. Por favor, inténtalo de nuevo.");
        } finally {
            setConfigLoading(false);
        }
    };

    const handleConfigChange = (field, value) => {
        setGlobalConfig(prev => ({
            ...prev,
            [field]: value
        }));
    };

    const handleOpenClosingPersonDialog = () => {
        setClosingPersonDialog({ open: true });
        setSelectedClosingPerson('');
    };

    const handleCloseClosingPersonDialog = () => {
        setClosingPersonDialog({ open: false });
    };

    const handleSetClosingPerson = async () => {
        if (!selectedClosingPerson) {
            alert("Por favor, selecciona un empleado como encargado de cierre.");
            return;
        }
        
        setClosingPersonLoading(true);
        try {
            await setClosingPerson(selectedClientId, selectedClosingPerson);
            
            const selectedUser = users.find(u => u.vinculoId === selectedClosingPerson);
            if (selectedUser) {
                setTodayClosingPerson({
                    userId: selectedUser.userId,
                    nombre: selectedUser.userData.nombre
                });
            }
            
            alert("Encargado de cierre asignado correctamente.");
            handleCloseClosingPersonDialog();
        } catch (error) {
            console.error("Error al asignar encargado de cierre:", error);
            alert("Error al asignar el encargado de cierre. Por favor, inténtalo de nuevo.");
        } finally {
            setClosingPersonLoading(false);
        }
    };

    const handleSendManualNotification = async () => {
        if (!notificationTitle || !notificationBody) {
            alert('Por favor, completa tanto el título como el cuerpo de la notificación.');
            return;
        }

        setIsSendingNotification(true);
        setNotificationSuccess('');

        try {
            let targetUsers = [];
            if (targetAudience === 'all') {
                targetUsers = users;
            } else if (targetAudience === 'role') {
                targetUsers = users.filter(u => u.userData.rol !== 'administrador');
            } else if (targetAudience === 'user' && selectedTargetUser) {
                const user = users.find(u => u.userId === selectedTargetUser);
                if (user) targetUsers = [user];
            }

            if (targetUsers.length === 0) {
                alert('No se encontraron usuarios para enviar la notificación.');
                setIsSendingNotification(false);
                return;
            }

            const userIds = targetUsers.map(user => user.userId);

            const notificationPayload = {
                title: notificationTitle,
                body: notificationBody,
                icon: '/erick-go-logo.png',
                data: { url: '/' }
            };

            const response = await fetch('/.netlify/functions/send-notification', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userIds: userIds,
                    payload: notificationPayload,
                    clientId: selectedClientId,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Error al enviar la notificación.');
            }

            const result = await response.json();
            setNotificationSuccess(`¡Notificación enviada exitosamente a ${targetUsers.length} usuario(s)!`);
            setNotificationTitle('');
            setNotificationBody('');
            setSelectedTargetUser('');

        } catch (error) {
            console.error('Error al enviar notificación manual:', error);
            alert(`Hubo un error al enviar la notificación: ${error.message}`);
        } finally {
            setIsSendingNotification(false);
        }
    };

    const getAvailableEmployeesForDriver = (driver) => {
        if (!driver || !driver.zonasAsignadas || driver.zonasAsignadas.length === 0) {
            return [];
        }
        
        const employeesWithAsistencia = todayAsistencias.filter(asistencia => {
            const employee = users.find(u => u.userId === asistencia.empleadoId && u.userData.rol === 'empleado');
            if (!employee) return false;
            return driver.zonasAsignadas.includes(asistencia.zona);
        });
        
        return employeesWithAsistencia;
    };

    const getEmployeesByZoneGroup = (driver, group) => {
        if (!driver || !group || !group.zonas || group.zonas.length === 0) {
            return [];
        }
        
        const employeesWithAsistencia = todayAsistencias.filter(asistencia => {
            const employee = users.find(u => u.userId === asistencia.empleadoId && u.userData.rol === 'empleado');
            if (!employee) return false;
            return group.zonas.includes(asistencia.zona);
        });
        
        return employeesWithAsistencia;
    };

    const getZoneNameById = (zoneId) => {
        const zone = zones.find(z => z.id === zoneId);
        return zone ? zone.nombre : 'Zona desconocida';
    };

    const getEmployeeNameById = (employeeId) => {
        const employee = users.find(u => u.userId === employeeId);
        return employee ? employee.userData.nombre : 'Empleado desconocido';
    };

    const handleOpenWeeklyClosingConfigDialog = () => {
        setWeeklyClosingConfigDialog({ open: true });
    };

    const handleCloseWeeklyClosingConfigDialog = () => {
        setWeeklyClosingConfigDialog({ open: false });
    };

    const handleWeeklyConfigChange = (day, vinculoId) => {
        if (!vinculoId) {
            setWeeklyClosingConfig(prev => ({
                ...prev,
                [day]: { vinculoId: null, userId: null, userName: null }
            }));
            return;
        }

        const selectedUser = users.find(u => u.vinculoId === vinculoId);
        if (selectedUser) {
            setWeeklyClosingConfig(prev => ({
                ...prev,
                [day]: {
                    vinculoId: vinculoId,
                    userId: selectedUser.userId,
                    userName: selectedUser.userData.nombre
                }
            }));
        }
    };

    const handleSaveWeeklyClosingConfig = async () => {
        setWeeklyConfigLoading(true);
        try {
            const success = await updateWeeklyClosingConfig(selectedClientId, weeklyClosingConfig);
            
            if (success) {
                alert("Configuración semanal de cierre guardada correctamente.");
                
                const todayClosingPerson = await getTodayClosingPersonFromWeeklyConfig(selectedClientId);
                setTodayClosingPerson(todayClosingPerson);
                
                handleCloseWeeklyClosingConfigDialog();
            } else {
                alert("Error al guardar la configuración semanal de cierre. Por favor, inténtalo de nuevo.");
            }
        } catch (error) {
            console.error("Error al guardar configuración semanal de cierre:", error);
            alert("Error al guardar la configuración semanal de cierre. Por favor, inténtalo de nuevo.");
        } finally {
            setWeeklyConfigLoading(false);
        }
    };

    return (
        <Box sx={{ 
            width: '100vw', 
            height: '100vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden' 
        }}>
            <Box sx={{ p: 2, flexShrink: 0, backgroundColor: 'background.paper', width: '100%' }}>
                <Typography variant="h4" gutterBottom>Panel de Administración - Erick Go</Typography>
            </Box>
            
            {!isAppReady ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
                    <span>Cargando...</span>
                </Box>
            ) : (
                <Box sx={{ flexShrink: 0, backgroundColor: 'background.paper', width: '100%' }}>
                    <Tabs 
                        value={tabValue} 
                        onChange={handleTabChange} 
                        aria-label="admin tabs"
                        variant="scrollable"
                        scrollButtons="auto"
                        sx={{ 
                            '& .MuiTabs-flexContainer': {
                                justifyContent: 'center'
                            }
                        }}
                    >
                        {!selectedClientId && <Tab label="Clientes" />}
                        {!selectedClientId && <Tab icon={<SettingsIcon sx={{ mr: 1 }} />} label="Administrativa" />}
                        {selectedClientId && <Tab label="Usuarios" />}
                        {selectedClientId && <Tab label="Zonas" />}
                        {selectedClientId && <Tab icon={<AccessTimeIcon sx={{ mr: 1 }} />} label="Cierre" />}
                        {selectedClientId && <Tab icon={<PeopleIcon sx={{ mr: 1 }} />} label="Conductores" />}
                        {selectedClientId && <Tab icon={<SendIcon sx={{ mr: 1 }} />} label="Notificaciones" />}
                        {selectedClientId && <Tab icon={<NotificationsActiveIcon sx={{ mr: 1 }} />} label="Config. Notif." />}
                    </Tabs>
                </Box>
            )}

            {!selectedClientId ? (
                <React.Fragment>
                    <TabPanel value={tabValue} index={0}>
                        <Button variant="contained" color="warning" startIcon={<AddIcon />} sx={{ mb: 2 }} onClick={() => handleOpenClientDialog(null, false)}>
                            Registrar Nuevo Cliente (Empresa)
                        </Button>
                        <Box sx={{ width: '100%', overflowX: 'auto' }}>
                            <TableContainer component={Paper} sx={{ minWidth: '800px' }}>
                                <Table>
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>Nombre del Cliente</TableCell>
                                            <TableCell>Dirección</TableCell>
                                            <TableCell>Teléfono</TableCell>
                                            <TableCell>Acciones</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {clients.map((c) => (
                                            <TableRow key={c.id}>
                                                <TableCell>{c.nombre}</TableCell>
                                                <TableCell>{c.direccion || 'Sin dirección'}</TableCell>
                                                <TableCell>{c.telefono || 'Sin teléfono'}</TableCell>
                                                <TableCell>
                                                    <IconButton onClick={() => handleOpenClientDialog(c, true)} color="secondary"><Edit /></IconButton>
                                                    <IconButton onClick={() => handleDeleteClient(c.id)} color="error"><Delete /></IconButton>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </Box>
                    </TabPanel>
                    
                    <TabPanel value={tabValue} index={1}>
                        <Box sx={{ width: '100%', overflowX: 'auto' }}>
                            <Typography variant="h5" gutterBottom>
                                <SettingsIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
                                Configuración Administrativa
                            </Typography>
                            
                            <Card sx={{ mb: 3 }}>
                                <CardContent>
                                    <Typography variant="h6" component="div" gutterBottom>
                                        <SettingsIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
                                        Configuración Global de la Aplicación
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                        Configura los parámetros generales de la aplicación que se mostrarán en todas las páginas.
                                    </Typography>
                                    <Typography variant="body2" sx={{ mb: 2 }}>
                                        <strong>Texto actual del pie de página:</strong>
                                        <br />
                                        <Box component="pre" sx={{ backgroundColor: '#f5f5f5', p: 1, borderRadius: 1, fontSize: '0.875rem', whiteSpace: 'pre-line' }}>
                                            {globalConfig.loginFooterText || 'No configurado'}
                                        </Box>
                                    </Typography>
                                    <Button 
                                        variant="contained" 
                                        color="primary" 
                                        onClick={handleOpenConfigDialog}
                                        sx={{ mb: 2 }}
                                    >
                                        Editar Configuración
                                    </Button>
                                </CardContent>
                            </Card>
                            
                            <Alert severity="warning" sx={{ mb: 3 }}>
                                <Typography variant="strong">ADVERTENCIA:</Typography> Las siguientes herramientas son para fines de prueba y desarrollo. Las acciones de eliminación son permanentes y no se pueden deshacer.
                            </Alert>
                            
                            <Grid container spacing={3} sx={{ minWidth: '800px' }}>
                                <Grid item xs={12} md={6}>
                                    <Card sx={{ height: '100%' }}>
                                        <CardContent>
                                            <Typography variant="h6" component="div" gutterBottom>
                                                <CleaningServicesIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
                                                Eliminar Usuarios por Rol
                                            </Typography>
                                            <Typography variant="body2" color="text.secondary">
                                                Elimina masivamente todos los usuarios con un rol específico. Los administradores nunca serán eliminados.
                                            </Typography>
                                        </CardContent>
                                        <CardActions sx={{ pt: 0, flexDirection: 'column', alignItems: 'stretch' }}>
                                            <Button 
                                                variant="contained" 
                                                color="error" 
                                                onClick={() => handleOpenDeleteDialog('empleado')}
                                                disabled={isProcessing}
                                                sx={{ mb: 1 }}
                                            >
                                                Eliminar Todos los Empleados
                                            </Button>
                                            <Button 
                                                variant="contained" 
                                                color="error" 
                                                onClick={() => handleOpenDeleteDialog('conductor')}
                                                disabled={isProcessing}
                                                sx={{ mb: 1 }}
                                            >
                                                Eliminar Todos los Conductores
                                            </Button>
                                            <Button 
                                                variant="contained" 
                                                color="error" 
                                                onClick={() => handleOpenDeleteDialog('cliente')}
                                                disabled={isProcessing}
                                            >
                                                Eliminar Todos los Clientes
                                            </Button>
                                        </CardActions>
                                    </Card>
                                </Grid>
                                
                                <Grid item xs={12} md={6}>
                                    <Card sx={{ height: '100%' }}>
                                        <CardContent>
                                            <Typography variant="h6" component="div" gutterBottom>
                                                <BuildIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
                                                Crear Datos de Prueba
                                            </Typography>
                                            <Typography variant="body2" color="text.secondary">
                                                Crea un conjunto de datos de prueba con 2 clientes, cada uno con 10 empleados y 2 conductores.
                                            </Typography>
                                        </CardContent>
                                        <CardActions sx={{ pt: 0 }}>
                                            <Button 
                                                variant="contained" 
                                                color="primary" 
                                                onClick={handleOpenCreateTestDataDialog}
                                                disabled={isProcessing}
                                                fullWidth
                                            >
                                                Generar Datos de Prueba
                                            </Button>
                                        </CardActions>
                                    </Card>
                                </Grid>
                            </Grid>
                        </Box>
                    </TabPanel>
                </React.Fragment>
            ) : (
                <React.Fragment>
                    <TabPanel value={tabValue} index={0}>
                        <Button variant="contained" color="warning" startIcon={<AddIcon />} sx={{ mb: 2 }} onClick={() => setRegisterModalOpen(true)}>
                            Registrar Nuevo Usuario
                        </Button>
                        <Box sx={{ width: '100%', overflowX: 'auto' }}>
                            <TableContainer component={Paper} sx={{ minWidth: '800px' }}>
                                <Table>
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>Correo Electrónico</TableCell>
                                            <TableCell>Nombre</TableCell>
                                            <TableCell>Teléfono</TableCell>
                                            <TableCell>Rol</TableCell>
                                            <TableCell>Acciones</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {users.map((u) => {
                                            const hasAttendanceToday = u.userData.rol === 'empleado' && todayAsistencias.some(a => a.empleadoId === u.userId);

                                            return (
                                                <TableRow key={u.vinculoId}>
                                                    <TableCell>{u.userData.correo}</TableCell>
                                                    <TableCell>{u.userData.nombre || 'Sin nombre'}</TableCell>
                                                    <TableCell>{u.userData.telefono || 'Sin teléfono'}</TableCell>
                                                    <TableCell>{u.userData.rol || 'Sin rol'}</TableCell>
                                                    <TableCell>
                                                        <IconButton onClick={() => handleEditUser(u)} color="secondary" disabled={isLoading}><Edit /></IconButton>
                                                        <IconButton onClick={() => handleDeleteUser(u)} color="error" disabled={isLoading}><Delete /></IconButton>
                                                        {hasAttendanceToday && (
                                                            <IconButton 
                                                                onClick={() => handleDeleteAttendance(u.userId, u.userData.nombre)} 
                                                                color="warning" 
                                                                title="Quitar Asistencia de Hoy"
                                                                disabled={isLoading}
                                                            >
                                                                <PersonOffIcon />
                                                            </IconButton>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </Box>
                    </TabPanel>
                    <TabPanel value={tabValue} index={1}>
                        <Button variant="contained" color="warning" startIcon={<AddIcon />} sx={{ mb: 2 }} onClick={() => handleOpenZoneDialog()}>
                            Añadir Zona
                        </Button>
                        <Box sx={{ width: '100%', overflowX: 'auto' }}>
                            <TableContainer component={Paper} sx={{ minWidth: '800px' }}>
                                <Table>
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>Nombre de la Zona</TableCell>
                                            <TableCell>Acciones</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {zones.map((z) => (
                                            <TableRow key={z.id}>
                                                <TableCell>{z.nombre}</TableCell>
                                                <TableCell>
                                                    <IconButton onClick={() => handleOpenZoneDialog(z, true)} color="secondary"><Edit /></IconButton>
                                                    <IconButton onClick={() => handleDeleteZone(z.id)} color="error"><Delete /></IconButton>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </Box>
                    </TabPanel>
                    
                    <TabPanel value={tabValue} index={2}>
                        <Typography variant="h5" gutterBottom>
                            <AccessTimeIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
                            Configuración de Cierre Diario
                        </Typography>
                        
                        <Alert severity="info" sx={{ mb: 3 }}>
                            Aquí puedes configurar quién será el encargado de cerrar la empresa cada día. Esta persona deberá registrar la hora de cierre del local, que será visible para los conductores.
                        </Alert>
                        
                        {todayClosingPerson ? (
                            <Card sx={{ mb: 3, backgroundColor: '#f5f5f5' }}>
                                <CardContent>
                                    <Typography variant="h6">Encargado de cierre hoy:</Typography>
                                    <Typography variant="body1">{todayClosingPerson.nombre}</Typography>
                                </CardContent>
                            </Card>
                        ) : (
                            <Alert severity="warning" sx={{ mb: 3 }}>
                                No hay un encargado de cierre configurado para hoy.
                            </Alert>
                        )}
                        
                        {closingTime ? (
                            <Card sx={{ mb: 3, backgroundColor: '#f5f5f5' }}>
                                <CardContent>
                                    <Typography variant="h6">Hora de cierre hoy:</Typography>
                                    <Typography variant="body1">{convertTo12HourFormat(closingTime)}</Typography>
                                </CardContent>
                            </Card>
                        ) : (
                            <Alert severity="warning" sx={{ mb: 3 }}>
                                No hay una hora de cierre configurada para hoy.
                            </Alert>
                        )}
                        
                        <Button 
                            variant="contained" 
                            color="primary" 
                            startIcon={<AccessTimeIcon />}
                            onClick={handleOpenClosingPersonDialog}
                            sx={{ mb: 2, mr: 2 }}
                        >
                            Configurar Encargado de Cierre Diario
                        </Button>
                        
                        <Button 
                            variant="contained" 
                            color="secondary" 
                            startIcon={<CalendarTodayIcon />}
                            onClick={handleOpenWeeklyClosingConfigDialog}
                            sx={{ mb: 2 }}
                        >
                            Configurar Encargados de Cierre Semanal
                        </Button>
                        
                        <Box sx={{ width: '100%', overflowX: 'auto' }}>
                            <TableContainer component={Paper} sx={{ minWidth: '800px' }}>
                                <Table>
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>Correo Electrónico</TableCell>
                                            <TableCell>Nombre</TableCell>
                                            <TableCell>Rol</TableCell>
                                            <TableCell>Acciones</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {users.filter(u => u.userData.rol === 'empleado').map((u) => (
                                            <TableRow key={u.vinculoId}>
                                                <TableCell>{u.userData.correo}</TableCell>
                                                <TableCell>{u.userData.nombre || 'Sin nombre'}</TableCell>
                                                <TableCell>{u.userData.rol || 'Sin rol'}</TableCell>
                                                <TableCell>
                                                    <Button 
                                                        variant="outlined" 
                                                        color="primary"
                                                        onClick={() => {
                                                            setSelectedClosingPerson(u.vinculoId);
                                                            handleSetClosingPerson();
                                                        }}
                                                        disabled={closingPersonLoading}
                                                    >
                                                        Asignar como Encargado
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </Box>
                    </TabPanel>

                    <TabPanel value={tabValue} index={3}>
                        <Typography variant="h5" gutterBottom>
                            <PeopleIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
                            Información de Conductores
                        </Typography>
                        
                        <Alert severity="info" sx={{ mb: 3 }}>
                            Aquí puedes ver información detallada sobre cada conductor, incluyendo los empleados disponibles y los grupos de zonas asignados.
                        </Alert>
                        
                        {closingTime ? (
                            <Card sx={{ mb: 3, backgroundColor: '#f5f5f5' }}>
                                <CardContent>
                                    <Typography variant="h6">
                                        <ScheduleIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
                                        Hora de cierre hoy: {convertTo12HourFormat(closingTime)}
                                    </Typography>
                                </CardContent>
                            </Card>
                        ) : (
                            <Alert severity="warning" sx={{ mb: 3 }}>
                                No hay una hora de cierre configurada para hoy.
                            </Alert>
                        )}
                        
                        <Box sx={{ width: '100%' }}>
                            {users.filter(u => u.userData.rol === 'conductor').map((driver) => {
                                const availableEmployees = getAvailableEmployeesForDriver(driver);
                                
                                return (
                                    <Accordion key={driver.vinculoId} sx={{ mb: 2 }}>
                                        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                                                <Typography variant="h6" sx={{ flexGrow: 1 }}>
                                                    {driver.userData.nombre}
                                                </Typography>
                                                <Chip 
                                                    label={`${availableEmployees.length} empleados disponibles`} 
                                                    color="primary" 
                                                    variant="outlined" 
                                                    sx={{ mr: 2 }}
                                                />
                                                <IconButton onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleEditUser(driver);
                                                }} color="secondary" disabled={isLoading}>
                                                    <Edit />
                                                </IconButton>
                                            </Box>
                                        </AccordionSummary>
                                        <AccordionDetails>
                                            <Grid container spacing={2}>
                                                <Grid item xs={12} md={6}>
                                                    <Typography variant="subtitle1" gutterBottom>
                                                        <PeopleIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
                                                        Total de empleados disponibles: {availableEmployees.length}
                                                    </Typography>
                                                    <Typography variant="body2" color="text.secondary" gutterBottom>
                                                        Empleados que han registrado asistencia hoy en zonas asignadas a este conductor:
                                                    </Typography>
                                                    {availableEmployees.length > 0 ? (
                                                        <List dense>
                                                            {availableEmployees.map((asistencia) => (
                                                                <ListItem key={asistencia.id}>
                                                                    <ListItemText 
                                                                        primary={getEmployeeNameById(asistencia.empleadoId)} 
                                                                        secondary={`Zona: ${getZoneNameById(asistencia.zona)}`}
                                                                    />
                                                                </ListItem>
                                                            ))}
                                                        </List>
                                                    ) : (
                                                        <Alert severity="info">No hay empleados disponibles para este conductor.</Alert>
                                                    )}
                                                </Grid>
                                                <Grid item xs={12} md={6}>
                                                    <Typography variant="subtitle1" gutterBottom>
                                                        <GroupIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
                                                        Grupos de Zonas
                                                    </Typography>
                                                    {driver.gruposZonas && driver.gruposZonas.length > 0 ? (
                                                        driver.gruposZonas.map((group) => {
                                                            const employeesInGroup = getEmployeesByZoneGroup(driver, group);
                                                            return (
                                                                <Card key={group.id} sx={{ mb: 2 }}>
                                                                    <CardContent>
                                                                        <Typography variant="subtitle2" gutterBottom>
                                                                            {group.nombre}
                                                                        </Typography>
                                                                        <Typography variant="body2" color="text.secondary" gutterBottom>
                                                                            Zonas: {group.zonas.map(zoneId => getZoneNameById(zoneId)).join(', ')}
                                                                        </Typography>
                                                                        <Typography variant="body2" gutterBottom>
                                                                            Empleados en este grupo: {employeesInGroup.length}
                                                                        </Typography>
                                                                        {employeesInGroup.length > 0 ? (
                                                                            <List dense>
                                                                                {employeesInGroup.map((asistencia) => (
                                                                                    <ListItem key={asistencia.id}>
                                                                                        <ListItemText 
                                                                                            primary={getEmployeeNameById(asistencia.empleadoId)} 
                                                                                            secondary={`Zona: ${getZoneNameById(asistencia.zona)}`}
                                                                                        />
                                                                                    </ListItem>
                                                                                ))}
                                                                            </List>
                                                                        ) : (
                                                                            <Alert severity="info">No hay empleados en este grupo.</Alert>
                                                                        )}
                                                                    </CardContent>
                                                                </Card>
                                                            );
                                                        })
                                                    ) : (
                                                        <Alert severity="info">Este conductor no tiene grupos de zonas configurados.</Alert>
                                                    )}
                                                </Grid>
                                            </Grid>
                                        </AccordionDetails>
                                    </Accordion>
                                );
                            })}
                        </Box>
                    </TabPanel>

                    <TabPanel value={tabValue} index={4}>
                        <Typography variant="h5" gutterBottom>
                            <SendIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
                            Enviar Notificación Manual
                        </Typography>
                        
                        <Alert severity="info" sx={{ mb: 3 }}>
                            Usa esta herramienta para enviar notificaciones push a los usuarios de la empresa seleccionada. Las notificaciones llegarán a los dispositivos de los usuarios, incluso si la aplicación está cerrada.
                        </Alert>

                        {notificationSuccess && <Alert severity="success" sx={{ mb: 2 }}>{notificationSuccess}</Alert>}

                        <Grid container spacing={3}>
                            <Grid item xs={12} md={8}>
                                <TextField
                                    label="Título de la Notificación"
                                    fullWidth
                                    value={notificationTitle}
                                    onChange={(e) => setNotificationTitle(e.target.value)}
                                    margin="normal"
                                />
                                <TextField
                                    label="Cuerpo del Mensaje"
                                    fullWidth
                                    multiline
                                    rows={4}
                                    value={notificationBody}
                                    onChange={(e) => setNotificationBody(e.target.value)}
                                    margin="normal"
                                />
                            </Grid>
                            <Grid item xs={12} md={4}>
                                <FormControl fullWidth margin="normal">
                                    <InputLabel id="audience-select-label">Audiencia</InputLabel>
                                    <Select
                                        labelId="audience-select-label"
                                        value={targetAudience}
                                        label="Audiencia"
                                        onChange={(e) => setTargetAudience(e.target.value)}
                                    >
                                        <MenuItem value="all">Todos los Usuarios</MenuItem>
                                        <MenuItem value="role">Por Rol (Empleados y Conductores)</MenuItem>
                                        <MenuItem value="user">Usuario Específico</MenuItem>
                                    </Select>
                                </FormControl>

                                {targetAudience === 'user' && (
                                    <FormControl fullWidth margin="normal">
                                        <InputLabel id="user-select-label">Seleccionar Usuario</InputLabel>
                                        <Select
                                            labelId="user-select-label"
                                            value={selectedTargetUser}
                                            label="Seleccionar Usuario"
                                            onChange={(e) => setSelectedTargetUser(e.target.value)}
                                        >
                                            {users.map((u) => (
                                                <MenuItem key={u.userId} value={u.userId}>
                                                    {u.userData.nombre} ({u.userData.rol})
                                                </MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>
                                )}

                                <Button
                                    variant="contained"
                                    color="primary"
                                    startIcon={isSendingNotification ? <CircularProgress size={20} color="inherit" /> : <SendIcon />}
                                    onClick={handleSendManualNotification}
                                    disabled={isSendingNotification || !notificationTitle || !notificationBody}
                                    fullWidth
                                    sx={{ mt: 3 }}
                                >
                                    {isSendingNotification ? 'Enviando...' : 'Enviar Notificación'}
                                </Button>
                            </Grid>
                        </Grid>
                    </TabPanel>

                    <TabPanel value={tabValue} index={5}>
                        <NotificationSettings />
                    </TabPanel>
                </React.Fragment>
            )}

            <Dialog open={configDialog.open} onClose={handleCloseConfigDialog} maxWidth="md" fullWidth>
                <DialogTitle>
                    <SettingsIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
                    Configuración Global de la Aplicación
                </DialogTitle>
                <DialogContent>
                    <Box sx={{ mt: 2 }}>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                            Aquí puedes configurar el texto que aparecerá en el pie de página de la aplicación.
                        </Typography>
                        <TextField
                            margin="dense"
                            label="Texto del Pie de Página"
                            fullWidth
                            multiline
                            rows={4}
                            variant="outlined"
                            value={globalConfig.loginFooterText || ''}
                            onChange={(e) => handleConfigChange('loginFooterText', e.target.value)}
                            helperText="Puedes usar saltos de línea (\\n) para separar líneas. Este texto se mostrará en la página de inicio de sesión."
                        />
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseConfigDialog} disabled={configLoading}>
                        Cancelar
                    </Button>
                    <Button onClick={handleSaveConfig} variant="contained" disabled={configLoading}>
                        {configLoading ? 'Guardando...' : 'Guardar'}
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog open={closingPersonDialog.open} onClose={handleCloseClosingPersonDialog} maxWidth="md" fullWidth>
                <DialogTitle>
                    <AccessTimeIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
                    Configurar Encargado de Cierre
                </DialogTitle>
                <DialogContent>
                    <Box sx={{ mt: 2 }}>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                            Selecciona al empleado que será el encargado de cerrar la empresa hoy. Esta persona deberá registrar la hora de cierre del local.
                        </Typography>
                        <FormControl fullWidth margin="dense">
                            <InputLabel id="closing-person-select-label">Empleado</InputLabel>
                            <Select
                                labelId="closing-person-select-label"
                                id="closing-person-select"
                                value={selectedClosingPerson}
                                label="Empleado"
                                onChange={(e) => setSelectedClosingPerson(e.target.value)}
                            >
                                {users.filter(u => u.userData.rol === 'empleado').map((u) => (
                                    <MenuItem key={u.vinculoId} value={u.vinculoId}>
                                        {u.userData.nombre || 'Sin nombre'} ({u.userData.correo})
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseClosingPersonDialog} disabled={closingPersonLoading}>
                        Cancelar
                    </Button>
                    <Button onClick={handleSetClosingPerson} variant="contained" disabled={closingPersonLoading}>
                        {closingPersonLoading ? 'Guardando...' : 'Guardar'}
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog open={weeklyClosingConfigDialog.open} onClose={handleCloseWeeklyClosingConfigDialog} maxWidth="lg" fullWidth>
                <DialogTitle>
                    <CalendarTodayIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
                    Configurar Encargados de Cierre Semanal
                </DialogTitle>
                <DialogContent>
                    <Box sx={{ mt: 2 }}>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                            Configura los encargados de cierre para cada día de la semana. Esta configuración se mantendrá hasta que la modifiques.
                        </Typography>
                        
                        <Grid container spacing={2}>
                            {[
                                { key: 'lunes', label: 'Lunes' },
                                { key: 'martes', label: 'Martes' },
                                { key: 'miercoles', label: 'Miércoles' },
                                { key: 'jueves', label: 'Jueves' },
                                { key: 'viernes', label: 'Viernes' },
                                { key: 'sabado', label: 'Sábado' },
                                { key: 'domingo', label: 'Domingo' }
                            ].map((day) => (
                                <Grid item xs={12} sm={6} md={4} key={day.key}>
                                    <Card sx={{ mb: 2 }}>
                                        <CardContent>
                                            <Typography variant="subtitle1" gutterBottom>
                                                {day.label}
                                            </Typography>
                                            <FormControl fullWidth margin="dense">
                                                <InputLabel id={`${day.key}-person-select-label`}>Encargado</InputLabel>
                                                <Select
                                                    labelId={`${day.key}-person-select-label`}
                                                    id={`${day.key}-person-select`}
                                                    value={weeklyClosingConfig[day.key]?.vinculoId || ''}
                                                    label="Encargado"
                                                    onChange={(e) => handleWeeklyConfigChange(day.key, e.target.value)}
                                                >
                                                    <MenuItem value="">
                                                        <em>Sin encargado</em>
                                                    </MenuItem>
                                                    {users.filter(u => u.userData.rol === 'empleado').map((u) => (
                                                        <MenuItem key={u.vinculoId} value={u.vinculoId}>
                                                            {u.userData.nombre || 'Sin nombre'}
                                                        </MenuItem>
                                                    ))}
                                                </Select>
                                            </FormControl>
                                            {weeklyClosingConfig[day.key]?.userName && (
                                                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                                                    Actual: {weeklyClosingConfig[day.key].userName}
                                                </Typography>
                                            )}
                                        </CardContent>
                                    </Card>
                                </Grid>
                            ))}
                        </Grid>
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseWeeklyClosingConfigDialog} disabled={weeklyConfigLoading}>
                        Cancelar
                    </Button>
                    <Button onClick={handleSaveWeeklyClosingConfig} variant="contained" disabled={weeklyConfigLoading}>
                        {weeklyConfigLoading ? 'Guardando...' : 'Guardar Configuración'}
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog open={deleteDialog.open} onClose={handleCloseDeleteDialog}>
                <DialogTitle>
                    <WarningIcon sx={{ verticalAlign: 'middle', mr: 1, color: 'error.main' }} />
                    Confirmar Eliminación
                </DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        ¿Estás seguro de que quieres eliminar todos los usuarios con rol "{deleteDialog.role}"?
                    </DialogContentText>
                    <DialogContentText sx={{ mt: 2, fontWeight: 'bold', color: 'error.main' }}>
                        Esta acción es permanente y no se puede deshacer.
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseDeleteDialog} disabled={isProcessing}>
                        Cancelar
                    </Button>
                    <Button 
                        onClick={handleConfirmDelete} 
                        color="error" 
                        variant="contained"
                        disabled={isProcessing}
                        startIcon={isProcessing ? <CircularProgress size={20} /> : <Delete />}
                    >
                        {isProcessing ? 'Eliminando...' : 'Confirmar Eliminación'}
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog open={createTestDataDialog.open} onClose={handleCloseCreateTestDataDialog}>
                <DialogTitle>
                    <BuildIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
                    Crear Datos de Prueba
                </DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        ¿Estás seguro de que quieres crear datos de prueba? Esto creará:
                    </DialogContentText>
                    <ul>
                        <li>2 clientes (empresas)</li>
                        <li>5 zonas para cada cliente</li>
                        <li>10 empleados para cada cliente</li>
                        <li>2 conductores para cada cliente</li>
                    </ul>
                    <DialogContentText sx={{ mt: 2, fontWeight: 'bold' }}>
                        Esta acción puede tardar varios segundos en completarse.
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseCreateTestDataDialog} disabled={isProcessing}>
                        Cancelar
                    </Button>
                    <Button 
                        onClick={handleConfirmCreateTestData} 
                        color="primary" 
                        variant="contained"
                        disabled={isProcessing}
                        startIcon={isProcessing ? <CircularProgress size={20} /> : <BuildIcon />}
                    >
                        {isProcessing ? 'Creando...' : 'Crear Datos de Prueba'}
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog open={editUserDialog.open} onClose={() => setEditUserDialog({ open: false, user: null, vinculoId: null })} maxWidth="md" fullWidth>
                <DialogTitle>Editar Usuario</DialogTitle>
                <DialogContent sx={{ maxHeight: '70vh', overflow: 'auto' }}>
                    <TextField margin="dense" label="Nombre" fullWidth variant="standard" value={editUserDialog.user?.userData?.nombre || ''} disabled />
                    <TextField margin="dense" label="Correo Electrónico" fullWidth variant="standard" value={editUserDialog.user?.userData?.correo || ''} disabled />
                    <TextField margin="dense" label="Teléfono" fullWidth variant="standard" value={editUserDialog.user?.userData?.telefono || ''} disabled />
                    <TextField margin="dense" label="Rol" fullWidth variant="standard" value={editUserDialog.user?.userData?.rol || ''} disabled />
                    
                    {editUserDialog.user?.userData?.rol === 'conductor' && (
                        <React.Fragment>
                            <Box sx={{ mt: 3 }}>
                                <Typography variant="subtitle1" sx={{ mb: 1 }}>Asignar Zonas Individuales:</Typography>
                                <List>
                                {zones.map((zone) => {
                                    const currentZonas = editUserDialog.user?.zonasAsignadas || [];
                                    const isAssigned = currentZonas.includes(zone.id);
                                    return (
                                        <ListItem key={zone.id} dense>
                                            <ListItemText primary={zone.nombre} />
                                            <Checkbox
                                                checked={isAssigned}
                                                onChange={(e) => handleZoneCheckboxChange(zone.id, e.target.checked)}
                                            />
                                        </ListItem>
                                    );
                                })}
                                </List>
                            </Box>

                            <Divider sx={{ my: 2 }} />

                            <Box sx={{ mt: 2 }}>
                                <Typography variant="subtitle1" sx={{ mb: 1 }}>Grupos de Zonas para Viajes Múltiples:</Typography>
                                <Typography variant="caption" sx={{ mb: 1, color: 'text.secondary' }}>
                                    Nota: Una zona solo puede estar en un grupo a la vez.
                                </Typography>
                                <Button variant="outlined" color="warning" onClick={handleAddGroup} sx={{ mb: 2 }}>
                                    Añadir Nuevo Grupo
                                </Button>
                                {editUserDialog.user?.gruposZonas && editUserDialog.user.gruposZonas.length > 0 ? (
                                    <List>
                                        {editUserDialog.user.gruposZonas.map((group) => (
                                            <Paper key={group.id} sx={{ p: 2, mb: 1, border: '1px solid #e0e0e0' }}>
                                                <Typography variant="h6">{group.nombre}</Typography>
                                                <DialogContentText sx={{ mb: 1 }}>
                                                    Selecciona las zonas para este grupo:
                                                </DialogContentText>
                                                <List dense>
                                                    {zones
                                                        .filter(zone => (editUserDialog.user?.zonasAsignadas || []).includes(zone.id))
                                                        .map((zone) => {
                                                            const isZoneInGroup = group.zonas.includes(zone.id);
                                                            return (
                                                                <ListItem key={zone.id} dense>
                                                                    <ListItemText primary={zone.nombre} />
                                                                    <Checkbox
                                                                        checked={isZoneInGroup}
                                                                        onChange={(e) => handleZoneGroupChange(group.id, zone.id, e.target.checked)}
                                                                    />
                                                                </ListItem>
                                                            );
                                                        })}
                                                </List>
                                                <Button onClick={() => handleDeleteGroup(group.id)} color="error" size="small">
                                                    Eliminar Grupo
                                                </Button>
                                            </Paper>
                                        ))}
                                    </List>
                                ) : (
                                    <Alert severity="info">No hay grupos de zonas configurados. Añade uno para habilitar los viajes múltiples.</Alert>
                                )}
                            </Box>
                        </React.Fragment>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setEditUserDialog({ open: false, user: null, vinculoId: null })}>Cancelar</Button>
                    <Button onClick={handleSaveUser} variant="contained">Guardar</Button>
                </DialogActions>
            </Dialog>

            <RegisterUserModal 
                open={registerModalOpen} 
                onClose={() => setRegisterModalOpen(false)} 
                onUserCreated={async () => { 
                    const updatedUsers = await fetchUsersByClient(selectedClientId); 
                    setUsers(sortUsersByRole(updatedUsers)); 
                }} 
            />
            
            <Dialog open={clientDialog.open} onClose={() => setClientDialog({ open: false, client: null, isEdit: false })}>
                <DialogTitle>{clientDialog.isEdit ? 'Editar Cliente' : 'Añadir Cliente'}</DialogTitle>
                <DialogContent>
                    <TextField autoFocus margin="dense" label="Nombre del Cliente" fullWidth variant="standard" value={clientDialog.client?.nombre || ''} onChange={(e) => setClientDialog({ ...clientDialog, client: { ...clientDialog.client, nombre: e.target.value } })} />
                    <TextField margin="dense" label="Dirección" fullWidth variant="standard" value={clientDialog.client?.direccion || ''} onChange={(e) => setClientDialog({ ...clientDialog, client: { ...clientDialog.client, direccion: e.target.value } })} />
                    <TextField margin="dense" label="Teléfono" fullWidth variant="standard" placeholder="+58 414-123-4567" value={clientDialog.client?.telefono || ''} onChange={(e) => setClientDialog({ ...clientDialog, client: { ...clientDialog.client, telefono: e.target.value } })} />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setClientDialog({ open: false, client: null, isEdit: false })}>Cancelar</Button>
                    <Button onClick={handleSaveClient} variant="contained">Guardar</Button>
                </DialogActions>
            </Dialog>
            <Dialog open={zoneDialog.open} onClose={() => setZoneDialog({ open: false, zone: null, isEdit: false })}>
                <DialogTitle>{zoneDialog.isEdit ? 'Editar Zona' : 'Añadir Zona'}</DialogTitle>
                <DialogContent>
                    <TextField autoFocus margin="dense" label="Nombre de la Zona" fullWidth variant="standard" value={zoneDialog.zone?.nombre || ''} onChange={(e) => setZoneDialog({ ...zoneDialog, zone: { ...zoneDialog.zone, nombre: e.target.value } })} />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setZoneDialog({ open: false, zone: null, isEdit: false })}>Cancelar</Button>
                    <Button onClick={handleSaveZone} variant="contained">Guardar</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}