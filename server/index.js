const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs-extra');
const winston = require('winston');
require('dotenv').config();

// Import routes
const uploadRoutes = require('./routes/upload');
const transcriptionRoutes = require('./routes/transcription');
const projectRoutes = require('./routes/projects');
const exportRoutes = require('./routes/export');
const authRoutes = require('./routes/auth');

// Import middleware
const authMiddleware = require('./middleware/auth');
const errorHandler = require('./middleware/errorHandler');

// Import services
const TranscriptionQueue = require('./services/transcriptionQueue');
const CleanupService = require('./services/cleanupService');

// Logger configuration
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'transcription-api' },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Terlalu banyak request dari IP ini, coba lagi dalam 15 menit.'
});

// Middleware
app.use(helmet());
app.use(compression());
app.use(limiter);
app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:3000",
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Ensure directories exist
const ensureDirectories = async () => {
  const dirs = [
    'uploads/audio',
    'uploads/temp',
    'processed',
    'exports',
    'logs',
    'backups'
  ];
  
  for (const dir of dirs) {
    await fs.ensureDir(path.join(__dirname, dir));
  }
};

// Initialize transcription queue with socket.io
const transcriptionQueue = new TranscriptionQueue(io);

// Socket.io connection handling
io.on('connection', (socket) => {
  logger.info(`Client connected: ${socket.id}`);
  
  socket.on('join-project', (projectId) => {
    socket.join(`project-${projectId}`);
    logger.info(`Client ${socket.id} joined project ${projectId}`);
  });
  
  socket.on('leave-project', (projectId) => {
    socket.leave(`project-${projectId}`);
    logger.info(`Client ${socket.id} left project ${projectId}`);
  });
  
  socket.on('disconnect', () => {
    logger.info(`Client disconnected: ${socket.id}`);
  });
});

// Make io available to routes
app.use((req, res, next) => {
  req.io = io;
  req.transcriptionQueue = transcriptionQueue;
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/upload', authMiddleware, uploadRoutes);
app.use('/api/transcription', authMiddleware, transcriptionRoutes);
app.use('/api/projects', authMiddleware, projectRoutes);
app.use('/api/export', authMiddleware, exportRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/build')));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build', 'index.html'));
  });
}

// Error handling middleware
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint tidak ditemukan',
    message: `Route ${req.originalUrl} tidak tersedia`
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  
  // Close server
  server.close(() => {
    logger.info('HTTP server closed');
    
    // Close database connections, cleanup, etc.
    process.exit(0);
  });
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// Initialize and start server
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    // Ensure required directories exist
    await ensureDirectories();
    
    // Initialize cleanup service
    const cleanupService = new CleanupService();
    cleanupService.start();
    
    server.listen(PORT, () => {
      logger.info(`Server berjalan di port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();