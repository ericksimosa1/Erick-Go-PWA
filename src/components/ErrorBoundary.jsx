// src/components/ErrorBoundary.jsx

import React from 'react';
import { Box, Typography, Button, Paper } from '@mui/material';
import { ErrorOutline as ErrorIcon } from '@mui/icons-material';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    // Actualiza el estado para que el siguiente renderizado muestre la UI alternativa
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // También puedes registrar el error en un servicio de reporte de errores
    console.error("ErrorBoundary atrapó un error:", error, errorInfo);
    
    this.setState({
      error: error,
      errorInfo: errorInfo
    });

    // Opcional: Enviar el error a un servicio como Sentry
    // logErrorToMyService(error, errorInfo);
  }

  handleReload = () => {
    // Recarga la página para intentar recuperar la aplicación
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      // Puedes renderizar cualquier UI de fallback
      return (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            padding: 3,
            backgroundColor: '#f5f5f5',
          }}
        >
          <Paper elevation={3} sx={{ p: 4, maxWidth: 500, textAlign: 'center' }}>
            <ErrorIcon sx={{ fontSize: 64, color: 'error.main', mb: 2 }} />
            <Typography variant="h5" gutterBottom>
              ¡Ups! Algo salió mal.
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
              La aplicación encontró un error inesperado. Por favor, recarga la página para intentarlo de nuevo.
            </Typography>
            
            {/* Opcional: Mostrar detalles del error en desarrollo */}
            {process.env.NODE_ENV === 'development' && (
              <Box sx={{ mt: 2, p: 2, backgroundColor: '#eee', borderRadius: 1, textAlign: 'left' }}>
                <Typography variant="subtitle2">Detalles del error (solo visible en desarrollo):</Typography>
                <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {this.state.error && this.state.error.toString()}
                  <br />
                  {this.state.errorInfo.componentStack}
                </pre>
              </Box>
            )}

            <Button variant="contained" color="primary" onClick={this.handleReload}>
              Recargar Página
            </Button>
          </Paper>
        </Box>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;