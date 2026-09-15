import mongoose from 'mongoose';

export function notFound(req, _res, next) {
  const error = new Error(`Route not found: ${req.method} ${req.originalUrl}`);
  error.status = 404;
  next(error);
}

export function errorHandler(error, _req, res, _next) {
  let status = error.status || 500;
  let message = error.message || 'Internal server error';
  let errors = error.errors;

  if (error instanceof mongoose.Error.ValidationError) {
    status = 422;
    message = 'Validation failed';
    errors = Object.fromEntries(Object.entries(error.errors).map(([k, v]) => [k, v.message]));
  } else if (error instanceof mongoose.Error.CastError) {
    status = 400;
    message = `Invalid ${error.path}`;
  } else if (error.code === 11000) {
    status = 409;
    message = 'A record with those values already exists';
  }

  if (status >= 500 && process.env.NODE_ENV !== 'test') console.error(error);
  res.status(status).json({ success: false, message, ...(errors ? { errors } : {}) });
}
