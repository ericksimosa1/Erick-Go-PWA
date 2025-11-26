// src/App.jsx
import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { CssBaseline, CircularProgress, Box, Snackbar, Alert } from '@mui/material';
import { useAuthStore } from './store/authStore';
import LoginPage from './pages/LoginPage';
import CompanySelectorPage from './pages/CompanySelectorPage';
import AdminDashboard from './pages/AdminDashboard';
import EmployeeDashboard from './pages/EmployeeDashboard';
import DriverDashboard from './pages/DriverDashboard';
import MainLayout from './components/MainLayout';

// --- TEMA DE LA APLICACIÓN ---
const erickGoTheme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#1A237E' },
    secondary: { main: '#00838F' },
    warning: { main: '#FF8F00' },
    error: { main: '#D50000' },
  },
  components: {
    MuiCard: { styleOverrides: { root: { borderRadius: 12 } } },
    MuiPaper: { styleOverrides: { root: { borderRadius: 12 } } },
    MuiButton: { styleOverrides: { root: { borderRadius: 8, textTransform: 'none' } } },
  },
});

// Componente principal que maneja la lógica de la aplicación
function AppContent() {
    const location = useLocation();
    const { user, selectedClientId } = useAuthStore();
    const [isAppReady, setIsAppReady] = useState(false);
    
    // --- ESTADOS PARA NOTIFICACIONES ---
    const [subscription, setSubscription] = useState(null);
    const [notificationPermissionStatus, setNotificationPermissionStatus] = useState('');
    const [showPermissionSnackbar, setShowPermissionSnackbar] = useState(false);
    const [subscriptionError, setSubscriptionError] = useState('');

    // --- FUNCIÓN PARA ACTUALIZAR EL ESTADO DEL RECORDATORIO ---
    const updateReminderStatus = async (action) => {
        if (!user?.uid) {
            console.error('No se puede actualizar el recordatorio sin un usuario logueado.');
            return;
        }
        console.log(`Actualizando estado de recordatorio a: ${action} para el usuario: ${user.uid}`);
        try {
            await fetch('/.netlify/functions/update-reminder-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.uid, action: action }),
            });
            console.log('Estado de recordatorio actualizado correctamente.');
        } catch (error) {
            console.error('Error al actualizar el estado del recordatorio:', error);
        }
    };

    // --- EFECTO PARA REGISTRAR EL SERVICE WORKER ---
    useEffect(() => {
        const registerServiceWorker = async () => {
            if ('serviceWorker' in navigator) {
                try {
                    const registration = await navigator.serviceWorker.register('/sw.js');
                    console.log('Service Worker registrado con éxito:', registration);
                } catch (error) {
                    console.error('Error al registrar el Service Worker:', error);
                }
            }
        };
        registerServiceWorker();
    }, []);

    // --- EFECTO PARA SUSCRIBIR AL USUARIO A LAS NOTIFICACIONES PUSH ---
    useEffect(() => {
        if (user && selectedClientId) {
            subscribeUserToPush();
        }
    }, [user, selectedClientId]);

    // --- EFECTO PARA ESCUCHAR MENSAJES DEL SERVICE WORKER ---
    useEffect(() => {
        const handleMessage = (event) => {
            if (event.data && event.data.type === 'NAVIGATE') {
                const url = new URL(event.data.payload.url, window.location.origin);
                const action = url.searchParams.get('action');

                if (action) {
                    console.log(`Acción recibida del Service Worker: ${action}`);
                    if (action === 'going_on_my_own' || action === 'free') {
                        updateReminderStatus(action);
                    }
                    window.location.href = '/login';
                } else {
                    window.location.href = event.data.payload.url;
                }
            }
        };

        navigator.serviceWorker.addEventListener('message', handleMessage);
        return () => navigator.serviceWorker.removeEventListener('message', handleMessage);
    }, [user]);

    // --- FUNCIÓN PARA SUSCRIBIR AL USUARIO (VERSIÓN MEJORADA) ---
    const subscribeUserToPush = async () => {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            console.warn('Las notificaciones push no son compatibles con este navegador.');
            setSubscriptionError('Tu navegador no es compatible con notificaciones push.');
            return;
        }

        try {
            const registration = await navigator.serviceWorker.ready;
            let permission = Notification.permission;
            
            if (permission === 'default') {
                setShowPermissionSnackbar(true);
                
                setTimeout(async () => {
                    try {
                        permission = await Notification.requestPermission();
                        setNotificationPermissionStatus(permission);
                        
                        if (permission !== 'granted') {
                            setSubscriptionError('Has denegado el permiso para recibir notificaciones. Puedes cambiarlo en la configuración de tu navegador.');
                            setShowPermissionSnackbar(false);
                            return;
                        }
                        
                        await processSubscription(registration);
                    } catch (error) {
                        console.error('Error al solicitar permiso de notificación:', error);
                        setSubscriptionError('Error al solicitar permiso de notificación. Inténtalo de nuevo.');
                        setShowPermissionSnackbar(false);
                    }
                }, 1000);
            } else if (permission === 'granted') {
                await processSubscription(registration);
            } else {
                setSubscriptionError('Has denegado previamente el permiso para recibir notificaciones. Puedes cambiarlo en la configuración de tu navegador.');
            }
        } catch (error) {
            console.error('Error al suscribir al usuario a notificaciones push:', error);
            
            if (error.name === 'AbortError' && error.message.includes('push service error')) {
                setSubscriptionError('No se pudo suscribir a las notificaciones. El navegador podría estar bloqueando el servicio de push.');
            } else {
                setSubscriptionError('Error inesperado al suscribir a las notificaciones. Inténtalo de nuevo.');
            }
        }
    };

    // --- FUNCIÓN AUXILIAR PARA PROCESAR LA SUSCRIPCIÓN ---
    const processSubscription = async (registration) => {
        try {
            let subscription = await registration.pushManager.getSubscription();
            
            if (!subscription) {
                const publicVapidKey = 'BL5HL7-NzkovXAWOzhIpDiqBmzBw-x5zOpEnrIqbIkKEGEPf8FOs87_oUcidqrU98-81J2nHXRDQufR6sfyxF2g';
                subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlB64ToUint8Array(publicVapidKey),
                });
            }
            
            setSubscription(subscription);
            await saveSubscriptionToBackend(subscription);
            console.log('Usuario suscrito a notificaciones push.');
            setSubscriptionError('');
        } catch (error) {
            console.error('Error al procesar la suscripción:', error);
            setSubscriptionError('Error al procesar la suscripción. Inténtalo de nuevo.');
        }
    };

    // --- FUNCIÓN PARA GUARDAR LA SUSCRIPCIÓN EN NETLIFY ---
    const saveSubscriptionToBackend = async (subscription) => {
        if (!user?.uid || !selectedClientId) return;
        try {
            const response = await fetch('/.netlify/functions/save-subscription', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    subscription: subscription, 
                    userId: user.uid,
                    clientId: selectedClientId
                }),
            });
            if (!response.ok) throw new Error('Error al guardar la suscripción en el backend.');
            const data = await response.json();
            console.log('Suscripción guardada en el backend:', data);
        } catch (error) {
            console.error('Error en saveSubscriptionToBackend:', error);
            setSubscriptionError('Error al guardar la suscripción en el servidor. Inténtalo de nuevo.');
        }
    };
    
    // --- LÓGICA EXISTENTE DE LA APP ---
    useEffect(() => {
        const timer = setTimeout(() => setIsAppReady(true), 500);
        return () => clearTimeout(timer);
    }, []);

    if (!isAppReady) {
        return <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}><CircularProgress /></Box>;
    }

    function urlB64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    }

    return (
        <>
            <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/select-company" element={(user?.rol === 'conductor' || user?.rol === 'empleado') ? <CompanySelectorPage /> : <Navigate to="/login" replace />} />
                <Route path="/admin-dashboard" element={user?.rol === 'administrador' ? <MainLayout><AdminDashboard /></MainLayout> : <Navigate to="/login" replace />} />
                <Route path="/empleado-dashboard" element={user?.rol === 'empleado' ? <MainLayout><EmployeeDashboard /></MainLayout> : <Navigate to="/login" replace />} />
                <Route path="/conductor-dashboard" element={user?.rol === 'conductor' ? <MainLayout><DriverDashboard /></MainLayout> : <Navigate to="/login" replace />} />
                <Route path="/" element={<Navigate to="/login" replace />} />
                <Route path="*" element={<Navigate to="/login" />} />
            </Routes>

            <Snackbar 
                open={showPermissionSnackbar} 
                autoHideDuration={6000} 
                onClose={() => setShowPermissionSnackbar(false)} 
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert onClose={() => setShowPermissionSnackbar(false)} severity="info" sx={{ width: '100%' }}>
                    Vamos a solicitar permiso para enviarte notificaciones importantes sobre tus viajes.
                </Alert>
            </Snackbar>

            {notificationPermissionStatus && (
                <Snackbar 
                    open={true} 
                    autoHideDuration={6000} 
                    onClose={() => setNotificationPermissionStatus('')} 
                    anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
                >
                    <Alert onClose={() => setNotificationPermissionStatus('')} severity={notificationPermissionStatus === 'granted' ? 'success' : 'warning'} sx={{ width: '100%' }}>
                        {notificationPermissionStatus === 'granted' ? '¡Notificaciones activadas!' : 'Las notificaciones están desactivadas.'}
                    </Alert>
                </Snackbar>
            )}

            {subscriptionError && (
                <Snackbar 
                    open={true} 
                    autoHideDuration={8000} 
                    onClose={() => setSubscriptionError('')} 
                    anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
                >
                    <Alert onClose={() => setSubscriptionError('')} severity="error" sx={{ width: '100%' }}>
                        {subscriptionError}
                    </Alert>
                </Snackbar>
            )}
        </>
    );
}

function App() {
    return (
        <ThemeProvider theme={erickGoTheme}>
            <CssBaseline />
            <Router>
                <AppContent />
            </Router>
        </ThemeProvider>
    );
}

// ESTA ES LA LÍNEA CLAVE QUE FALTABA
export default App;