const winston = require('winston');

const logger = winston.createLogger({
  level: 'error',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'error-handler' },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

const errorHandler = (err, req, res, next) => {
  // Log the error
  logger.error({
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id
  });

  // Default error
  let error = { ...err };
  error.message = err.message;

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    const message = 'Resource tidak ditemukan';
    error = { message, statusCode: 404 };
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const message = 'Data sudah ada dalam database';
    error = { message, statusCode: 400 };
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map(val => val.message).join(', ');
    error = { message, statusCode: 400 };
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    const message = 'Token tidak valid';
    error = { message, statusCode: 401 };
  }

  if (err.name === 'TokenExpiredError') {
    const message = 'Token telah kadaluarsa';
    error = { message, statusCode: 401 };
  }

  // Multer errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    const message = 'File terlalu besar';
    error = { message, statusCode: 400 };
  }

  if (err.code === 'LIMIT_FILE_COUNT') {
    const message = 'Terlalu banyak file';
    error = { message, statusCode: 400 };
  }

  // FFmpeg errors
  if (err.message && err.message.includes('ffmpeg')) {
    const message = 'Gagal memproses file audio';
    error = { message, statusCode: 400 };
  }

  // OpenAI API errors
  if (err.message && err.message.includes('OpenAI')) {
    const message = 'Gagal melakukan transkripsi';
    error = { message, statusCode: 503 };
  }

  // Network errors
  if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
    const message = 'Layanan tidak tersedia saat ini';
    error = { message, statusCode: 503 };
  }

  // File system errors
  if (err.code === 'ENOENT') {
    const message = 'File tidak ditemukan';
    error = { message, statusCode: 404 };
  }

  if (err.code === 'ENOSPC') {
    const message = 'Ruang penyimpanan tidak cukup';
    error = { message, statusCode: 507 };
  }

  // Rate limiting errors
  if (err.statusCode === 429) {
    const message = 'Terlalu banyak request, coba lagi nanti';
    error = { message, statusCode: 429 };
  }

  // Set default status code
  const statusCode = error.statusCode || 500;
  const message = error.message || 'Terjadi kesalahan pada server';

  // Send error response
  const response = {
    error: message,
    timestamp: new Date().toISOString(),
    path: req.url,
    method: req.method
  };

  // Add stack trace in development
  if (process.env.NODE_ENV === 'development') {
    response.stack = err.stack;
    response.details = err;
  }

  // Add request ID if available
  if (req.id) {
    response.requestId = req.id;
  }

  res.status(statusCode).json(response);
};

module.exports = errorHandler;