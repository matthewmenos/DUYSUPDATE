/**
 * Global error handler middleware
 */
export function errorHandler(err, req, res, next) {
  console.error('Error:', err);

  // Validation error
  if (err.isJoi) {
    return res.status(400).json({
      error: 'Validation failed',
      details: err.details.map(d => ({
        field: d.path.join('.'),
        message: d.message
      }))
    });
  }

  // Database error
  if (err.code === 'ECONNREFUSED') {
    return res.status(503).json({ error: 'Database connection failed' });
  }

  // Unique constraint
  if (err.code === '23505') {
    return res.status(409).json({ error: 'Record already exists' });
  }

  // Foreign key constraint
  if (err.code === '23503') {
    return res.status(400).json({ error: 'Invalid reference' });
  }

  // Custom app error
  if (err.statusCode) {
    return res.status(err.statusCode).json({ error: err.message });
  }

  // Default error
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
}

export class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
  }
}

export default errorHandler;
