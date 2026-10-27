export class ApiError extends Error {
  constructor(status, message, code = 'REQUEST_ERROR') {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export function notFound(_req, _res, next) {
  next(new ApiError(404, 'Route not found', 'ROUTE_NOT_FOUND'));
}

export function errorHandler(err, req, res, next) {
  // Log the error for debugging
  console.error('\n========== API ERROR ==========');
  console.error('Method:', req.method);
  console.error('URL:', req.originalUrl);
  console.error('Error name:', err?.name);
  console.error('Error code:', err?.code);
  console.error('Error message:', err?.message);
  console.error('Stack trace:', err?.stack);
  console.error('================================\n');

  if (res.headersSent) {
    return next(err);
  }

  // Duplicate MongoDB key error
  if (err?.code === 11000) {
    return res.status(409).json({
      error: {
        code: 'DUPLICATE_TRANSACTION',
        message:
          'A transaction with this reference_id already exists for this account.',
      },
    });
  }

  // Mongoose validation errors
  if (
    err?.name === 'ValidationError' ||
    err?.name === 'CastError'
  ) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: err.message,
      },
    });
  }

  // Handle other errors
  const status = err?.status || err?.statusCode || 500;

  return res.status(status).json({
    error: {
      code: status === 500
        ? 'INTERNAL_SERVER_ERROR'
        : err?.code || 'REQUEST_ERROR',
      message:
        status === 500
          ? 'An unexpected error occurred.'
          : err.message,
    },
  });
}
