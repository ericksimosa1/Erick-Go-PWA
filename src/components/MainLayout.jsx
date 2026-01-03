// src/components/MainLayout.jsx
import React, { useState, useEffect } from 'react';
import { 
    AppBar, 
    Toolbar, 
    Typography, 
    Button, 
    Box, 
    FormControl, 
    InputLabel, 
    Select, 
    MenuItem,
    CircularProgress,
    IconButton,
    useTheme,
    useMediaQuery
} from '@mui/material';
import ShareIcon from '@mui/icons-material/Share';
import { useAuthStore } from '../store/authStore';
import { useFirestore } from '../hooks/useFirestore';
import ShareAppModal from './ShareAppModal';
import PwaInstallPrompt from './PwaInstallPrompt'; // Importamos el componente de instalación

const MainLayout = ({ children }) => {
    const { user, logout, selectedClientId, setSelectedClient, clients, setClients } = useAuthStore();
    const { fetchClients } = useFirestore();
    const [isLoadingClients, setIsLoadingClients] = useState(true);
    const [shareModalOpen, setShareModalOpen] = useState(false);
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));
    const isSmallMobile = useMediaQuery(theme.breakpoints.down('sm'));
    const isAdmin = user?.rol === 'administrador';

    useEffect(() => {
        // Cargar clientes para todos los roles, no solo para administradores
        const getClients = async () => {
            setIsLoadingClients(true);
            try {
                const clientsData = await fetchClients();
                setClients(clientsData);
                console.log("MainLayout: Clientes cargados:", clientsData);
            } catch (error) {
                console.error("Error al cargar clientes en MainLayout:", error);
            } finally {
                setIsLoadingClients(false);
            }
        };
        
        // Solo cargar si no hay clientes o si la lista está vacía
        if (!clients || clients.length === 0) {
            getClients();
        } else {
            setIsLoadingClients(false);
        }
    }, [fetchClients, setClients, clients]);

    const handleClientChange = (event) => {
        const newClientId = event.target.value;
        setSelectedClient(newClientId === 'SELECT' ? null : newClientId);
    };

    const getActiveClientName = () => {
        if (!selectedClientId) return 'Sin Empresa Seleccionada';
        
        // Asegurarse de que clients es un array antes de usar find
        if (!Array.isArray(clients)) {
            console.error("MainLayout: 'clients' no es un array:", clients);
            return 'Error en datos de empresa';
        }
        
        const activeClient = clients.find(c => c.id === selectedClientId);
        return activeClient ? activeClient.nombre : 'Empresa no encontrada';
    };

    // Diseño original para empleados y conductores
    const renderOriginalLayout = () => (
        <Toolbar>
            <Box
                component="img"
                sx={{
                    height: 55,
                    mr: 2,
                    display: { xs: 'none', md: 'flex' }
                }}
                alt="Erick Go Logo"
                src="/erick-go-logo.png"
            />
            <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
                Erick Go - {getActiveClientName()}
            </Typography>
            
            <IconButton color="inherit" onClick={() => setShareModalOpen(true)} sx={{ mr: 1 }}>
                <ShareIcon />
            </IconButton>

            <Button color="inherit" onClick={logout}>Cerrar Sesión</Button>
        </Toolbar>
    );

    // Diseño optimizado para administrador
    const renderAdminLayout = () => (
        <Toolbar sx={{ pr: 1, pl: 1 }}>
            <Box
                component="img"
                sx={{
                    height: isSmallMobile ? 40 : 55,
                    mr: 1,
                    display: { xs: 'none', md: 'flex' }
                }}
                alt="Erick Go Logo"
                src="/erick-go-logo.png"
            />
            
            {/* Selector de empresa - movido hacia la izquierda */}
            <FormControl sx={{ 
                m: 0.5, 
                minWidth: isSmallMobile ? 120 : isMobile ? 160 : 220,
                mr: 1
            }} size="small">
                <InputLabel id="client-select-label">Empresa</InputLabel>
                {isLoadingClients ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 40, color: 'white' }}>
                        <CircularProgress color="inherit" size={20} />
                    </Box>
                ) : (
                    <Select
                        labelId="client-select-label"
                        value={selectedClientId || 'SELECT'}
                        onChange={handleClientChange}
                        label="Empresa"
                        sx={{ 
                            color: 'white', 
                            '.MuiOutlinedInput-notchedOutline': { borderColor: 'white' }, 
                            '& .MuiSvgIcon-root': { color: 'white' },
                            '& .MuiSelect-select': {
                                padding: isSmallMobile ? '8px 14px' : undefined
                            }
                        }}
                    >
                        <MenuItem value="SELECT">Seleccionar</MenuItem>
                        {Array.isArray(clients) && clients.map((client) => (
                            <MenuItem key={client.id} value={client.id}>
                                {isSmallMobile ? 
                                    (client.nombre.length > 15 ? `${client.nombre.substring(0, 15)}...` : client.nombre) 
                                    : client.nombre}
                            </MenuItem>
                        ))}
                    </Select>
                )}
            </FormControl>

            {/* Título - ahora ocupa menos espacio */}
            <Typography 
                variant={isSmallMobile ? "body1" : "h6"} 
                component="div" 
                sx={{ 
                    flexGrow: 1,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: isSmallMobile ? '100px' : isMobile ? '150px' : '300px'
                }}
            >
                {isSmallMobile ? getActiveClientName() : `Erick Go - ${getActiveClientName()}`}
            </Typography>
            
            {/* Botón de compartir - oculto en pantallas muy pequeñas */}
            {!isSmallMobile && (
                <IconButton color="inherit" onClick={() => setShareModalOpen(true)} sx={{ mr: 0.5 }}>
                    <ShareIcon />
                </IconButton>
            )}

            {/* Botón de cerrar sesión - movido hacia la izquierda */}
            <Button 
                color="inherit" 
                onClick={logout}
                size={isSmallMobile ? "small" : "medium"}
                sx={{ 
                    minWidth: isSmallMobile ? 'auto' : undefined,
                    px: isSmallMobile ?1 : undefined
                }}
            >
                {isSmallMobile ? 'Salir' : 'Cerrar Sesión'}
            </Button>
        </Toolbar>
    );

    return (
        <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
            <Box component="main" sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                <AppBar position="static">
                    {isAdmin ? renderAdminLayout() : renderOriginalLayout()}
                </AppBar>
                
                <Box sx={{ flexGrow: 1, p: 3, overflow: 'auto', height: 0 }}>
                    {/* COMPONENTE AGREGADO: Para pedir instalación de la app */}
                    <PwaInstallPrompt />
                    
                    {children}
                </Box>
            </Box>

            <ShareAppModal open={shareModalOpen} onClose={() => setShareModalOpen(false)} />
        </Box>
    );
};

export default MainLayout;