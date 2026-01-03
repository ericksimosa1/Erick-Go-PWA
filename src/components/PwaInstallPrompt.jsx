// src/components/PwaInstallPrompt.jsx
import React, { useState, useEffect } from 'react';
import { 
    Button, 
    Dialog, 
    DialogTitle, 
    DialogContent, 
    DialogActions, 
    Typography, 
    Box, 
    IconButton, 
    useMediaQuery, 
    useTheme, 
    Paper, 
    List, 
    ListItem, 
    ListItemText, 
    ListItemIcon 
} from '@mui/material';
import { 
    InstallMobile as InstallMobileIcon, 
    Close as CloseIcon, 
    IosShare as IosShareIcon, 
    Add as AddIcon,
    ArrowForwardIos as ArrowIcon
} from '@mui/icons-material';

const PwaInstallPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showDialog, setShowDialog] = useState(false);
  const [showIosBanner, setShowIosBanner] = useState(false);
  
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // --- DETECCIÓN DE SISTEMA OPERATIVO ---
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  
  // --- DETECCIÓN SI YA ESTÁ INSTALADO ---
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches;

  useEffect(() => {
    // Si ya está instalado, no mostramos nada
    if (isStandalone) return;

    // --- LÓGICA PARA ANDROID / CHROME (Automatic Prompt) ---
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      
      const hasSeenPrompt = localStorage.getItem('pwaInstallPromptSeen');
      if (!hasSeenPrompt && isMobile && !isIOS) {
        setTimeout(() => setShowDialog(true), 3000);
      }
    };

    window.addEventListener('beforeinstallprompt', handler);

    // --- LÓGICA PARA IOS (Banner Manual) ---
    // iOS no dispara evento, debemos mostrarlo manualmente si es usuario nuevo
    const hasSeenIosPrompt = localStorage.getItem('pwaIosInstallPromptSeen');
    if (isIOS && !hasSeenIosPrompt && isMobile) {
        // Pequeño delay para cargar la app primero
        setTimeout(() => setShowIosBanner(true), 4000);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, [isMobile, isIOS, isStandalone]);

  // --- MANEJO DE INSTALACIÓN ANDROID ---
  const handleInstallClick = async () => {
    if (!deferredPrompt) {
        // Fallback manual por si falla el evento automático
        alert("Para instalar en Android:\n1. Toca el menú (3 puntos) de Chrome.\n2. Toca 'Agregar a la pantalla de inicio'.");
        return;
    }

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      console.log('Usuario aceptó la instalación (Android)');
      localStorage.setItem('pwaInstallPromptSeen', 'true');
    } else {
      console.log('Usuario rechazó la instalación');
    }

    setDeferredPrompt(null);
    setShowDialog(false);
  };

  // --- CERRAR BANNER IOS ---
  const handleCloseIos = () => {
    setShowIosBanner(false);
    localStorage.setItem('pwaIosInstallPromptSeen', 'true');
  };

  const handleCloseDialog = () => {
    setShowDialog(false);
    // No guardamos en localStorage el rechazo del diálogo, 
    // quizás quieran instalar más tarde.
  };

  // --- SI NO ES MÓVIL O YA ESTÁ INSTALADO ---
  if (!isMobile || isStandalone) return null;

  // --- RENDERIZADO PARA IOS (Banner Informativo) ---
  if (isIOS && showIosBanner) {
    return (
        <Paper 
            elevation={3} 
            sx={{ 
                m:1, 
                p: 2, 
                bgcolor: 'info.light', 
                borderLeft: 6, 
                borderColor: 'info.main' 
            }}
        >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Box sx={{ flexGrow: 1 }}>
                    <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                        Instalar Erick Go en iPhone
                    </Typography>
                    <Typography variant="body2" gutterBottom>
                        Para recibir notificaciones aunque cierres Safari, instala la app:
                    </Typography>
                    
                    <List dense sx={{ py: 0 }}>
                        <ListItem dense>
                            <ListItemIcon sx={{ minWidth: 30 }}>
                                <IosShareIcon fontSize="small" />
                            </ListItemIcon>
                            <ListItemText primary="Toca el botón Compartir (cuadrado con flecha arriba)" />
                        </ListItem>
                        <ListItem dense>
                            <ListItemIcon sx={{ minWidth: 30 }}>
                                <ArrowIcon fontSize="small" />
                            </ListItemIcon>
                            <ListItemText primary="Desliza hacia abajo y toca 'Agregar al inicio'" />
                        </ListItem>
                    </List>
                </Box>
                
                <IconButton onClick={handleCloseIos} size="small">
                    <CloseIcon />
                </IconButton>
            </Box>
        </Paper>
    );
  }

  // --- RENDERIZADO PARA ANDROID (Botón Automático) ---
  if (!isIOS && showDialog) {
    return (
      <Dialog open={showDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ m: 0, p: 2 }}>
          <Typography variant="h6" component="div" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <InstallMobileIcon color="primary" />
            Instalar App Erick Go
          </Typography>
          <IconButton
            aria-label="close"
            onClick={handleCloseDialog}
            sx={{
              position: 'absolute',
              right: 8,
              top: 8,
              color: (theme) => theme.palette.grey[500],
            }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <Typography gutterBottom>
            Para recibir las notificaciones de asistencia y cierre aunque no tengas la app abierta, es necesario instalarla en tu teléfono.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Esto crea un icono en tu pantalla de inicio (como WhatsApp) y consume muy poca memoria.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ flexDirection: 'column', gap: 1, p: 2 }}>
          <Button 
            fullWidth 
            variant="contained" 
            color="primary" 
            startIcon={<InstallMobileIcon />}
            onClick={handleInstallClick}
          >
            Instalar Ahora
          </Button>
          <Button fullWidth onClick={handleCloseDialog}>
            Ahora no
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  return null;
};

export default PwaInstallPrompt;