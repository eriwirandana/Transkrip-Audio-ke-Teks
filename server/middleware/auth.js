const jwt = require('jsonwebtoken');
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'auth-middleware' },
  transports: [
    new winston.transports.File({ filename: 'logs/auth.log' }),
    new winston.transports.Console()
  ]
});

const authMiddleware = (req, res, next) => {
  try {
    // For development, bypass authentication
    if (process.env.NODE_ENV === 'development' && process.env.BYPASS_AUTH === 'true') {
      req.user = {
        id: 'dev-user',
        email: 'dev@example.com',
        name: 'Development User'
      };
      return next();
    }

    // Get token from header
    const authHeader = req.header('Authorization');
    
    if (!authHeader) {
      return res.status(401).json({
        error: 'Akses ditolak',
        message: 'Token tidak ditemukan'
      });
    }

    const token = authHeader.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        error: 'Akses ditolak',
        message: 'Token tidak valid'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    req.user = decoded;
    
    logger.info(`User authenticated: ${decoded.id}`);
    
    next();
  } catch (error) {
    logger.error('Auth middleware error:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'Token tidak valid',
        message: 'Silakan login kembali'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Token expired',
        message: 'Sesi Anda telah berakhir, silakan login kembali'
      });
    }
    
    res.status(500).json({
      error: 'Server error',
      message: 'Terjadi kesalahan pada server'
    });
  }
};

module.exports = authMiddleware;