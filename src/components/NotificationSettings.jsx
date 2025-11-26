// src/components/NotificationSettings.jsx
import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Card, CardContent, Switch, FormControlLabel,
  TextField, Button, Grid, Divider, Alert, Dialog, DialogTitle,
  DialogContent, DialogActions
} from '@mui/material';
import { Save as SaveIcon, Schedule as ScheduleIcon, NotificationsActive as NotificationsActiveIcon } from '@mui/icons-material';
import { useAuthStore } from '../store/authStore';

export default function NotificationSettings() {
  const { selectedClientId } = useAuthStore();
  
  const [notificationConfig, setNotificationConfig] = useState({
    // Configuración general
    enableNotifications: true,
    
    // Recordatorios de asistencia
    enableAttendanceReminder: true,
    attendanceReminderStartTime: '07:00', // NUEVO: Hora de inicio
    attendanceReminderEndTime: '10:00',   // NUEVO: Hora de fin
    attendanceReminderFrequency: 30,       // NUEVO: Frecuencia en minutos
    
    // Recordatorios de cierre
    enableClosingReminder: true,
    closingReminderTime: '18:00',
    
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
        setNotificationConfig(data.config);
        console.log('Configuración de notificaciones cargada:', data.config);
      }
      
    } catch (error) {
      console.error('Error al cargar configuración de notificaciones:', error);
      setError('Error al cargar la configuración de notificaciones.');
    } finally {
      setLoading(false);
    }
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
      
      const response = await fetch('/.netlify/functions/save-notification-config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          clientId: selectedClientId,
          config: notificationConfig
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
      
      const response = await fetch('/.netlify/functions/send-notification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          clientId: selectedClientId,
          payload: {
            title: testNotificationTitle || 'Notificación de Prueba',
            body: testNotificationBody || 'Esta es una notificación de prueba para verificar la configuración.',
            icon: '/erick-go-logo.png'
          }
        })
      });
      
      if (!response.ok) {
        throw new Error('Error al enviar la notificación de prueba');
      }
      
      setSuccessMessage('Notificación de prueba enviada a todos los usuarios de la empresa');
      setOpenTestDialog(false);
      setTestNotificationTitle('');
      setTestNotificationBody('');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error) {
      console.error('Error al enviar notificación de prueba:', error);
      setError('Error al enviar la notificación de prueba. Inténtalo de nuevo.');
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
            
            <Grid item xs={12} md={4}>
              <TextField
                label="Hora de inicio"
                type="time"
                value={notificationConfig.attendanceReminderStartTime}
                onChange={(e) => handleConfigChange('attendanceReminderStartTime', e.target.value)}
                disabled={!notificationConfig.enableNotifications || !notificationConfig.enableAttendanceReminder}
                fullWidth
                margin="normal"
                InputLabelProps={{
                  shrink: true,
                }}
                helperText="A partir de qué hora enviar recordatorios"
              />
            </Grid>
            
            <Grid item xs={12} md={4}>
              <TextField
                label="Hora de fin"
                type="time"
                value={notificationConfig.attendanceReminderEndTime}
                onChange={(e) => handleConfigChange('attendanceReminderEndTime', e.target.value)}
                disabled={!notificationConfig.enableNotifications || !notificationConfig.enableAttendanceReminder}
                fullWidth
                margin="normal"
                InputLabelProps={{
                  shrink: true,
                }}
                helperText="Hasta qué hora enviar recordatorios"
              />
            </Grid>

            <Grid item xs={12} md={4}>
              <TextField
                label="Frecuencia (minutos)"
                type="number"
                value={notificationConfig.attendanceReminderFrequency}
                onChange={(e) => handleConfigChange('attendanceReminderFrequency', parseInt(e.target.value))}
                disabled={!notificationConfig.enableNotifications || !notificationConfig.enableAttendanceReminder}
                fullWidth
                margin="normal"
                helperText="Cada cuántos minutos se repetirá el recordatorio"
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