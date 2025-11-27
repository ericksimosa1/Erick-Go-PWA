// src/components/NotificationSettings.jsx (VERSIÓN CORREGIDA CON FORMATO 12H)

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Card, CardContent, Switch, FormControlLabel,
  TextField, Button, Grid, Divider, Alert, Dialog, DialogTitle,
  DialogContent, DialogActions, Select, MenuItem
} from '@mui/material';
import { Save as SaveIcon, Schedule as ScheduleIcon, NotificationsActive as NotificationsActiveIcon } from '@mui/icons-material';
import { useAuthStore } from '../store/authStore';

// --- FUNCIONES AUXILIARES PARA CONVERSIÓN DE HORA ---

// Función para convertir hora de 24h a 12h con AM/PM
const convertTo12HourFormat = useCallback((time24) => {
    if (!time24) return { time: '12:00', ampm: 'AM' };
    const [hours, minutes] = time24.split(':');
    let hoursNum = parseInt(hours, 10);
    const minutesNum = parseInt(minutes, 10);
    const period = hoursNum >= 12 ? 'PM' : 'AM';
    hoursNum = hoursNum % 12 || 12;
    const formattedHours = hoursNum.toString().padStart(2, '0');
    const formattedMinutes = minutesNum.toString().padStart(2, '0');
    return { time: `${formattedHours}:${formattedMinutes}`, ampm: period };
}, []);

// Función para convertir hora de 12h a 24h
const convertTo24HourFormat = useCallback((time12, ampm) => {
    if (!time12) return '';
    const [hours, minutes] = time12.split(':');
    let hoursNum = parseInt(hours, 10);
    if (ampm === 'PM' && hoursNum < 12) {
        hoursNum += 12;
    } else if (ampm === 'AM' && hoursNum === 12) {
        hoursNum = 0;
    }
    const formattedHours = hoursNum.toString().padStart(2, '0');
    const formattedMinutes = minutes.toString().padStart(2, '0');
    return `${formattedHours}:${formattedMinutes}`;
}, []);


export default function NotificationSettings() {
  const { selectedClientId } = useAuthStore();
  
  const [notificationConfig, setNotificationConfig] = useState({
    // Configuración general
    enableNotifications: true,
    
    // Recordatorios de asistencia (CAMBIADO a objeto 12h)
    enableAttendanceReminder: true,
    attendanceReminderStartTime: { time: '07:00', ampm: 'PM' }, 
    attendanceReminderEndTime: { time: '10:30', ampm: 'PM' },   
    attendanceReminderFrequency: 30,       
    
    // Recordatorios de cierre (CAMBIADO a objeto 12h)
    enableClosingReminder: true,
    closingReminderTime: { time: '06:00', ampm: 'PM' },
    
    // Notificaciones de viajes
    enableTripNotifications: true,
  });
  
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [error, setError] = useState('');
  const [openTestDialog, setOpenTestDialog] = useState(false);
  const [testNotificationTitle, setTestNotificationTitle] = useState('');
  const [testNotificationBody, setTestNotificationBody] = useState('');

  // Cargar configuración al montar el componente o al cambiar de empresa
  useEffect(() => {
    if (selectedClientId) {
      loadNotificationConfig();
    } else {
        // Resetear configuración si no hay cliente seleccionado
        setNotificationConfig({
            enableNotifications: true,
            enableAttendanceReminder: true,
            attendanceReminderStartTime: { time: '07:00', ampm: 'PM' },
            attendanceReminderEndTime: { time: '10:30', ampm: 'PM' },
            attendanceReminderFrequency: 30,
            enableClosingReminder: true,
            closingReminderTime: { time: '06:00', ampm: 'PM' },
            enableTripNotifications: true,
        });
    }
  }, [selectedClientId]);

  const loadNotificationConfig = async () => {
    try {
      setLoading(true);
      setError('');
      
      const response = await fetch(`/.netlify/functions/get-notification-config?clientId=${selectedClientId}`);
      
      if (!response.ok) {
        throw new Error('Error al cargar la configuración');
      }
      
      const data = await response.json();
      
      if (data.config) {
        // CONVERSIÓN: Convertimos las horas de 24h del backend a 12h para la UI
        const startTime12h = convertTo12HourFormat(data.config.attendanceReminderStartTime || '19:00');
        const endTime12h = convertTo12HourFormat(data.config.attendanceReminderEndTime || '22:30');
        const closingTime12h = convertTo12HourFormat(data.config.closingReminderTime || '18:00');

        setNotificationConfig({
          ...data.config,
          attendanceReminderStartTime: startTime12h,
          attendanceReminderEndTime: endTime12h,
          closingReminderTime: closingTime12h,
        });
        console.log('Configuración de notificaciones cargada y convertida:', data.config);
      }
      
    } catch (error) {
      console.error('Error al cargar configuración de notificaciones:', error);
      setError('Error al cargar la configuración de notificaciones.');
    } finally {
      setLoading(false);
    }
  };

  // MANEJADORES ACTUALIZADOS para el nuevo objeto de hora
  const handleTimeChange = (field, timeValue) => {
    setNotificationConfig(prev => ({ ...prev, [field]: { ...prev[field], time: timeValue } }));
  };

  const handleAmPmChange = (field, ampmValue) => {
    setNotificationConfig(prev => ({ ...prev, [field]: { ...prev[field], ampm: ampmValue } }));
  };
  
  const handleConfigChange = (field, value) => {
    setNotificationConfig(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const saveConfig = async () => {
    try {
      setLoading(true);
      setError('');
      
      // CONVERSIÓN: Convertimos las horas de 12h de la UI a 24h para el backend
      const payloadToSave = {
        ...notificationConfig,
        attendanceReminderStartTime: convertTo24HourFormat(notificationConfig.attendanceReminderStartTime.time, notificationConfig.attendanceReminderStartTime.ampm),
        attendanceReminderEndTime: convertTo24HourFormat(notificationConfig.attendanceReminderEndTime.time, notificationConfig.attendanceReminderEndTime.ampm),
        closingReminderTime: convertTo24HourFormat(notificationConfig.closingReminderTime.time, notificationConfig.closingReminderTime.ampm),
      };
      
      const response = await fetch('/.netlify/functions/save-notification-config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          clientId: selectedClientId,
          config: payloadToSave,
        })
      });
      
      if (!response.ok) {
        throw new Error('Error al guardar la configuración');
      }
      
      setSuccessMessage('Configuración guardada correctamente');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error) {
      console.error('Error al guardar configuración:', error);
      setError('Error al guardar la configuración. Inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const sendTestNotification = async () => {
    try {
      setLoading(true);
      setError('');
      
      const notificationPayload = {
        title: testNotificationTitle || 'Notificación de Prueba',
        body: testNotificationBody || 'Esta es una notificación de prueba para verificar la configuración.',
        icon: '/erick-go-logo.png'
      };

      const response = await fetch('/.netlify/functions/send-notification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          clientId: selectedClientId,
          payload: notificationPayload,
        })
      });
      
      if (!response.ok) {
        throw new Error('Error al enviar la notificación de prueba.');
      }
      
      setSuccessMessage('Notificación de prueba enviada a todos los usuarios de la empresa');
      setOpenTestDialog(false);
      setTestNotificationTitle('');
      setTestNotificationBody('');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error) {
      console.error('Error al enviar notificación de prueba:', error);
      setError('Error al enviar la notificación de prueba. Revisa la consola para más detalles.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
        <NotificationsActiveIcon sx={{ mr: 1 }} />
        Configuración de Notificaciones
      </Typography>
      
      {successMessage && <Alert severity="success" sx={{ mb: 2 }}>{successMessage}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Configuración General
          </Typography>
          
          <FormControlLabel
            control={
              <Switch
                checked={notificationConfig.enableNotifications}
                onChange={(e) => handleConfigChange('enableNotifications', e.target.checked)}
                color="primary"
              />
            }
            label="Activar notificaciones para esta empresa"
          />
        </CardContent>
      </Card>
      
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            <ScheduleIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
            Recordatorios Automáticos de Asistencia
          </Typography>
          
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Switch
                    checked={notificationConfig.enableAttendanceReminder}
                    onChange={(e) => handleConfigChange('enableAttendanceReminder', e.target.checked)}
                    color="primary"
                    disabled={!notificationConfig.enableNotifications}
                  />
                }
                label="Activar recordatorio interactivo de asistencia"
              />
            </Grid>
            
            {/* NUEVO CAMPO DE HORA DE INICIO EN FORMATO 12H */}
            <Grid item xs={12} sm={6} md={3}>
              <TextField
                label="Hora de inicio"
                value={notificationConfig.attendanceReminderStartTime.time}
                onChange={(e) => handleTimeChange('attendanceReminderStartTime', e.target.value)}
                disabled={!notificationConfig.enableNotifications || !notificationConfig.enableAttendanceReminder}
                fullWidth
                margin="normal"
                placeholder="hh:mm"
              />
            </Grid>
            <Grid item xs={12} sm={6} md={2}>
              <Select
                value={notificationConfig.attendanceReminderStartTime.ampm}
                onChange={(e) => handleAmPmChange('attendanceReminderStartTime', e.target.value)}
                disabled={!notificationConfig.enableNotifications || !notificationConfig.enableAttendanceReminder}
                fullWidth
                sx={{ mt: 2, height: '56px' }} // Alinear con el TextField
              >
                <MenuItem value="AM">AM</MenuItem>
                <MenuItem value="PM">PM</MenuItem>
              </Select>
            </Grid>

            {/* NUEVO CAMPO DE HORA DE FIN EN FORMATO 12H */}
            <Grid item xs={12} sm={6} md={3}>
              <TextField
                label="Hora de fin"
                value={notificationConfig.attendanceReminderEndTime.time}
                onChange={(e) => handleTimeChange('attendanceReminderEndTime', e.target.value)}
                disabled={!notificationConfig.enableNotifications || !notificationConfig.enableAttendanceReminder}
                fullWidth
                margin="normal"
                placeholder="hh:mm"
              />
            </Grid>
            <Grid item xs={12} sm={6} md={2}>
              <Select
                value={notificationConfig.attendanceReminderEndTime.ampm}
                onChange={(e) => handleAmPmChange('attendanceReminderEndTime', e.target.value)}
                disabled={!notificationConfig.enableNotifications || !notificationConfig.enableAttendanceReminder}
                fullWidth
                sx={{ mt: 2, height: '56px' }} // Alinear con el TextField
              >
                <MenuItem value="AM">AM</MenuItem>
                <MenuItem value="PM">PM</MenuItem>
              </Select>
            </Grid>

            <Grid item xs={12} sm={6} md={2}>
              <TextField
                label="Frecuencia (minutos)"
                type="number"
                value={notificationConfig.attendanceReminderFrequency}
                onChange={(e) => handleConfigChange('attendanceReminderFrequency', parseInt(e.target.value, 10) || 0)}
                disabled={!notificationConfig.enableNotifications || !notificationConfig.enableAttendanceReminder}
                fullWidth
                margin="normal"
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>
      
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Notificaciones de Viajes
          </Typography>
          
          <FormControlLabel
            control={
              <Switch
                checked={notificationConfig.enableTripNotifications}
                onChange={(e) => handleConfigChange('enableTripNotifications', e.target.checked)}
                color="primary"
                disabled={!notificationConfig.enableNotifications}
              />
            }
            label="Activar notificaciones de viajes (inicio, llegada, finalización)"
          />
        </CardContent>
      </Card>
      
      <Divider sx={{ my: 3 }} />
      
      <Box sx={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
        <Button
          variant="contained"
          color="primary"
          startIcon={<SaveIcon />}
          onClick={saveConfig}
          disabled={loading}
        >
          {loading ? 'Guardando...' : 'Guardar Configuración'}
        </Button>
        
        <Button
          variant="outlined"
          onClick={() => setOpenTestDialog(true)}
          disabled={!notificationConfig.enableNotifications || loading}
        >
          Enviar Notificación de Prueba
        </Button>
      </Box>
      
      <Dialog open={openTestDialog} onClose={() => setOpenTestDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Enviar Notificación de Prueba</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Título"
            type="text"
            fullWidth
            variant="standard"
            value={testNotificationTitle}
            onChange={(e) => setTestNotificationTitle(e.target.value)}
            sx={{ mb: 2 }}
          />
          <TextField
            margin="dense"
            label="Mensaje"
            type="text"
            fullWidth
            multiline
            rows={4}
            variant="standard"
            value={testNotificationBody}
            onChange={(e) => setTestNotificationBody(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenTestDialog(false)}>Cancelar</Button>
          <Button onClick={sendTestNotification} disabled={loading}>
            {loading ? 'Enviando...' : 'Enviar'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}