/**
 * Custom Operational Application Error Class
 */
class AppError extends Error {
  constructor(message, statusCode = 500, errors = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.errors = errors;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 404 Route Not Found Middleware
 * Intercepts requests that do not match any defined application routes
 */
const notFoundHandler = (req, res, next) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
};

/**
 * Centralized Global Error Handling Middleware
 * Translates errors across validation, authentication, authorization,
 * database, and server layers into consistent JSON responses.
 */
const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || (res.statusCode !== 200 ? res.statusCode : 500);
  let message = err.message || "Internal Server Error";
  let errors = err.errors || undefined;

  // 1. JSON Parsing / Body-Parser Syntax Errors
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    statusCode = 400;
    message = "Malformed JSON payload in request body.";
  }

  // 2. JWT Authentication & Token Errors
  else if (err.name === "JsonWebTokenError") {
    statusCode = 401;
    message = "Invalid authentication token.";
  } else if (err.name === "TokenExpiredError") {
    statusCode = 401;
    message = "Authentication token has expired. Please log in again.";
  } else if (err.name === "NotBeforeError") {
    statusCode = 401;
    message = "Authentication token is not yet active.";
  }

  // 3. Authorization Errors
  else if (statusCode === 403 || err.name === "ForbiddenError") {
    statusCode = 403;
    message = err.message || "Forbidden: You do not have permission to access this resource.";
  }

  // 4. PostgreSQL Database Errors (Mapped by SQLSTATE code)
  else if (err.code) {
    switch (err.code) {
      case "23505": // unique_violation
        statusCode = 409;
        message = "A record with these details already exists.";
        break;
      case "23503": // foreign_key_violation
        statusCode = 400;
        message = "Referenced resource does not exist.";
        break;
      case "23502": // not_null_violation
        statusCode = 400;
        message = `Required field missing: ${err.column || "database column"}.`;
        break;
      case "23514": // check_violation
        statusCode = 400;
        message = "Provided data does not satisfy database validation constraints.";
        break;
      case "22P02": // invalid_text_representation
        statusCode = 400;
        message = "Invalid data format provided in request.";
        break;
      case "ECONNREFUSED":
      case "08001":
      case "08006":
        statusCode = 503;
        message = "Database service is temporarily unavailable. Please try again later.";
        break;
      default:
        if (statusCode >= 500) {
          statusCode = 500;
          message = "A database error occurred while processing your request.";
        }
        break;
    }
  }

  // 5. Secure In-Production Sanitization (Zero exposure of internal stacks, queries, or credentials)
  const isProduction = process.env.NODE_ENV === "production";
  if (isProduction && statusCode >= 500) {
    message = "An unexpected internal server error occurred.";
    errors = undefined;
  }

  // Log error safely for diagnostics without exposing sensitive parameters
  if (process.env.NODE_ENV !== "test") {
    console.error(`[${new Date().toISOString()}] [Error ${statusCode}] ${req.method} ${req.originalUrl}:`, {
      message: err.message,
      code: err.code,
      stack: isProduction ? undefined : err.stack,
    });
  }

  // Consistent JSON response structure
  const responsePayload = {
    success: false,
    message,
    ...(errors && { errors }),
    ...(!isProduction && err.stack && { stack: err.stack }),
  };

  res.status(statusCode).json(responsePayload);
};

module.exports = {
  AppError,
  notFoundHandler,
  errorHandler,
};
