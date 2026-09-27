const jwt = require("jsonwebtoken");

/**
 * Retrieves the JWT Secret from environment variables securely.
 * Throws a configuration error in production if JWT_SECRET is not configured.
 */
const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("FATAL: JWT_SECRET environment variable is not set in production.");
    }
    return "default_development_jwt_secret";
  }
  return secret;
};

/**
 * Extracts the Bearer token from the Authorization header
 * @param {Object} req - Express request object
 * @returns {string|null} - Token string or null
 */
const extractBearerToken = (req) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || typeof authHeader !== "string") {
    return null;
  }

  const parts = authHeader.trim().split(/\s+/);
  if (parts.length === 2 && parts[0].toLowerCase() === "bearer" && parts[1].length > 0) {
    return parts[1];
  }

  return null;
};

/**
 * Sanitizes decoded payload to guarantee sensitive fields are never attached to req.user
 * @param {Object} decoded - Decoded JWT payload
 * @returns {Object}
 */
const sanitizeUser = (decoded) => {
  if (!decoded || typeof decoded !== "object") return decoded;
  const { password, hash, password_hash, token, secret, ...safeUser } = decoded;
  return safeUser;
};

/**
 * Formats JWT verification errors into clean, secure responses
 * @param {Error} error
 * @param {Object} res - Express response object
 */
const handleAuthError = (error, res) => {
  if (error.name === "TokenExpiredError") {
    return res.status(401).json({
      success: false,
      message: "Authentication token has expired. Please log in again.",
      expiredAt: error.expiredAt,
    });
  }

  if (error.name === "JsonWebTokenError") {
    return res.status(401).json({
      success: false,
      message: "Invalid authentication token.",
    });
  }

  if (error.name === "NotBeforeError") {
    return res.status(401).json({
      success: false,
      message: "Authentication token is not yet active.",
    });
  }

  return res.status(401).json({
    success: false,
    message: "Authentication failed.",
  });
};

/**
 * Required Authentication Middleware
 * Enforces valid JWT token in Authorization header; rejects unauthenticated requests.
 */
const authenticate = (req, res, next) => {
  try {
    const token = extractBearerToken(req);

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Authorization required. Format: Bearer <token>",
      });
    }

    const secret = getJwtSecret();
    const decoded = jwt.verify(token, secret);

    req.user = sanitizeUser(decoded);
    next();
  } catch (error) {
    return handleAuthError(error, res);
  }
};

/**
 * Optional Authentication Middleware
 * Populates req.user if a valid token is present; proceeds without error if absent.
 */
const optionalAuth = (req, res, next) => {
  try {
    const token = extractBearerToken(req);

    if (token) {
      const secret = getJwtSecret();
      const decoded = jwt.verify(token, secret);
      req.user = sanitizeUser(decoded);
    } else {
      req.user = null;
    }
  } catch (error) {
    // For optional auth, an invalid/expired token leaves req.user null
    req.user = null;
  }
  next();
};

/**
 * Role-Based Authorization Middleware
 * Verifies that the authenticated user possesses an authorized role.
 * @param {...string} allowedRoles - List of permitted roles (e.g., 'admin', 'responder')
 */
const authorizeRoles = (...allowedRoles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Authentication required before accessing this resource.",
    });
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: `Forbidden: Access restricted to roles [${allowedRoles.join(", ")}].`,
    });
  }

  next();
};

authenticate.authenticate = authenticate;
authenticate.optionalAuth = optionalAuth;
authenticate.authorizeRoles = authorizeRoles;

module.exports = authenticate;
module.exports.authenticate = authenticate;
module.exports.optionalAuth = optionalAuth;
module.exports.authorizeRoles = authorizeRoles;
