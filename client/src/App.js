import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { CssBaseline, Box, Snackbar, Alert } from '@mui/material';
import { SocketProvider } from './contexts/SocketContext';
import { ProjectProvider } from './contexts/ProjectContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';

// Import components
import Navbar from './components/Navbar';
import Dashboard from './pages/Dashboard';
import TranscriptionEditor from './pages/TranscriptionEditor';
import ProjectManagement from './pages/ProjectManagement';
import Settings from './pages/Settings';
import Login from './pages/Login';
import Register from './pages/Register';
import LoadingScreen from './components/LoadingScreen';

// Import Indonesian language support
import { IndonesianLocalization } from './utils/indonesianLocalization';

// Create Material-UI theme with Indonesian academic styling
const createAppTheme = (mode) => createTheme({
  palette: {
    mode,
    primary: {
      main: mode === 'light' ? '#1976D2' : '#90CAF9',
      contrastText: '#ffffff',
    },
    secondary: {
      main: mode === 'light' ? '#388E3C' : '#A5D6A7',
    },
    background: {
      default: mode === 'light' ? '#F5F5F5' : '#121212',
      paper: mode === 'light' ? '#FFFFFF' : '#1E1E1E',
    },
    text: {
      primary: mode === 'light' ? '#212121' : '#FFFFFF',
      secondary: mode === 'light' ? '#757575' : '#AAAAAA',
    },
  },
  typography: {
    fontFamily: [
      'Inter',
      'Roboto',
      'Arial',
      'sans-serif'
    ].join(','),
    h1: {
      fontSize: '2.5rem',
      fontWeight: 600,
      lineHeight: 1.2,
    },
    h2: {
      fontSize: '2rem',
      fontWeight: 600,
      lineHeight: 1.3,
    },
    h3: {
      fontSize: '1.75rem',
      fontWeight: 600,
      lineHeight: 1.4,
    },
    h4: {
      fontSize: '1.5rem',
      fontWeight: 500,
      lineHeight: 1.4,
    },
    h5: {
      fontSize: '1.25rem',
      fontWeight: 500,
      lineHeight: 1.5,
    },
    h6: {
      fontSize: '1rem',
      fontWeight: 500,
      lineHeight: 1.6,
    },
    body1: {
      fontSize: '1rem',
      lineHeight: 1.6,
    },
    body2: {
      fontSize: '0.875rem',
      lineHeight: 1.6,
    },
  },
  shape: {
    borderRadius: 8,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 500,
          borderRadius: 8,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          boxShadow: mode === 'light' 
            ? '0 2px 8px rgba(0,0,0,0.1)' 
            : '0 2px 8px rgba(0,0,0,0.3)',
          borderRadius: 12,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
  },
});

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return <LoadingScreen />;
  }
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  return children;
};

// Public Route Component (redirect to dashboard if logged in)
const PublicRoute = ({ children }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return <LoadingScreen />;
  }
  
  if (user) {
    return <Navigate to="/dashboard" replace />;
  }
  
  return children;
};

// Main App Content Component
const AppContent = () => {
  const [darkMode, setDarkMode] = useState(() => {
    const savedMode = localStorage.getItem('darkMode');
    return savedMode ? JSON.parse(savedMode) : false;
  });
  
  const [notification, setNotification] = useState({
    open: false,
    message: '',
    severity: 'info'
  });

  const theme = createAppTheme(darkMode ? 'dark' : 'light');

  // Save dark mode preference
  useEffect(() => {
    localStorage.setItem('darkMode', JSON.stringify(darkMode));
  }, [darkMode]);

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
  };

  const showNotification = (message, severity = 'info') => {
    setNotification({
      open: true,
      message,
      severity
    });
  };

  const closeNotification = () => {
    setNotification({
      ...notification,
      open: false
    });
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <SocketProvider>
        <ProjectProvider>
          <Router>
            <Box sx={{ 
              display: 'flex', 
              flexDirection: 'column', 
              minHeight: '100vh',
              backgroundColor: 'background.default'
            }}>
              <Routes>
                {/* Public Routes */}
                <Route 
                  path="/login" 
                  element={
                    <PublicRoute>
                      <Login showNotification={showNotification} />
                    </PublicRoute>
                  } 
                />
                <Route 
                  path="/register" 
                  element={
                    <PublicRoute>
                      <Register showNotification={showNotification} />
                    </PublicRoute>
                  } 
                />
                
                {/* Protected Routes */}
                <Route path="/*" element={
                  <ProtectedRoute>
                    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
                      <Navbar 
                        darkMode={darkMode} 
                        toggleDarkMode={toggleDarkMode}
                        showNotification={showNotification}
                      />
                      <Box sx={{ flexGrow: 1, display: 'flex' }}>
                        <Routes>
                          <Route 
                            path="/dashboard" 
                            element={
                              <Dashboard showNotification={showNotification} />
                            } 
                          />
                          <Route 
                            path="/editor/:projectId?" 
                            element={
                              <TranscriptionEditor showNotification={showNotification} />
                            } 
                          />
                          <Route 
                            path="/projects" 
                            element={
                              <ProjectManagement showNotification={showNotification} />
                            } 
                          />
                          <Route 
                            path="/settings" 
                            element={
                              <Settings 
                                darkMode={darkMode}
                                toggleDarkMode={toggleDarkMode}
                                showNotification={showNotification} 
                              />
                            } 
                          />
                          <Route path="/" element={<Navigate to="/dashboard" replace />} />
                          <Route path="*" element={<Navigate to="/dashboard" replace />} />
                        </Routes>
                      </Box>
                    </Box>
                  </ProtectedRoute>
                } />
              </Routes>
              
              {/* Global Notification Snackbar */}
              <Snackbar
                open={notification.open}
                autoHideDuration={6000}
                onClose={closeNotification}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
              >
                <Alert 
                  onClose={closeNotification} 
                  severity={notification.severity}
                  variant="filled"
                  sx={{ width: '100%' }}
                >
                  {notification.message}
                </Alert>
              </Snackbar>
            </Box>
          </Router>
        </ProjectProvider>
      </SocketProvider>
    </ThemeProvider>
  );
};

// Main App Component
const App = () => {
  return (
    <AuthProvider>
      <IndonesianLocalization>
        <AppContent />
      </IndonesianLocalization>
    </AuthProvider>
  );
};

export default App;