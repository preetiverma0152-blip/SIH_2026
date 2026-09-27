const { body, param, query, validationResult } = require("express-validator");

/**
 * Valid values for enumerated fields
 */
const ALLOWED_SEVERITIES = ["low", "medium", "high", "critical"];
const ALLOWED_STATUSES = ["reported", "verified", "in_progress", "resolved", "dismissed"];

/**
 * Middleware to check validation results and return formatted error response
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map((err) => ({
      field: err.path || err.param,
      message: err.msg,
      value: err.value,
    }));

    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: formattedErrors,
    });
  }
  next();
};

/**
 * Validation rules for creating a new safety incident
 */
const validateCreateIncident = [
  body("title")
    .trim()
    .notEmpty()
    .withMessage("Title is required")
    .isLength({ min: 3, max: 255 })
    .withMessage("Title must be between 3 and 255 characters"),

  body("description")
    .trim()
    .notEmpty()
    .withMessage("Description is required")
    .isLength({ min: 5, max: 5000 })
    .withMessage("Description must be between 5 and 5000 characters"),

  body("category")
    .trim()
    .notEmpty()
    .withMessage("Category is required")
    .isLength({ min: 2, max: 100 })
    .withMessage("Category must be between 2 and 100 characters"),

  body("severity")
    .optional()
    .trim()
    .toLowerCase()
    .isIn(ALLOWED_SEVERITIES)
    .withMessage(`Severity must be one of: ${ALLOWED_SEVERITIES.join(", ")}`),

  body("status")
    .optional()
    .trim()
    .toLowerCase()
    .isIn(ALLOWED_STATUSES)
    .withMessage(`Status must be one of: ${ALLOWED_STATUSES.join(", ")}`),

  // Accepts latitude either at top level or inside location object
  body("latitude")
    .custom((value, { req }) => {
      const lat = value !== undefined ? value : req.body?.location?.latitude;
      if (lat === undefined || lat === null || lat === "") {
        throw new Error("Latitude is required");
      }
      const num = Number(lat);
      if (isNaN(num) || num < -90 || num > 90) {
        throw new Error("Latitude must be a valid number between -90 and 90 degrees");
      }
      return true;
    }),

  // Accepts longitude either at top level or inside location object
  body("longitude")
    .custom((value, { req }) => {
      const lng = value !== undefined ? value : req.body?.location?.longitude;
      if (lng === undefined || lng === null || lng === "") {
        throw new Error("Longitude is required");
      }
      const num = Number(lng);
      if (isNaN(num) || num < -180 || num > 180) {
        throw new Error("Longitude must be a valid number between -180 and 180 degrees");
      }
      return true;
    }),

  // Accepts address either at top level or inside location object
  body("address")
    .optional({ nullable: true })
    .custom((value, { req }) => {
      const addr = value !== undefined ? value : req.body?.location?.address;
      if (addr !== undefined && addr !== null) {
        if (typeof addr !== "string") {
          throw new Error("Address must be a string");
        }
        if (addr.length > 500) {
          throw new Error("Address cannot exceed 500 characters");
        }
      }
      return true;
    }),

  // Accepts reportedBy or user_id.
  // Authentication uses MongoDB ObjectIds, so these values are stored as TEXT in PostgreSQL.
  body("reportedBy")
    .optional({ nullable: true })
    .custom((value, { req }) => {
      const reporter = value !== undefined ? value : req.body?.user_id;
      if (reporter !== undefined && reporter !== null && reporter !== "") {
        if (typeof reporter !== "string" && typeof reporter !== "number") {
          throw new Error("reportedBy must be a valid user ID");
        }
      }
      return true;
    }),

  body("user_id")
    .optional({ nullable: true })
    .custom((value) => {
      if (value !== undefined && value !== null && value !== "") {
        if (typeof value !== "string" && typeof value !== "number") {
          throw new Error("user_id must be a valid user ID");
        }
      }
      return true;
    }),

  body("is_anonymous")
    .optional()
    .isBoolean()
    .withMessage("is_anonymous must be a boolean value"),

  body("media_urls")
    .optional()
    .isArray()
    .withMessage("media_urls must be an array of URL strings")
    .custom((urls) => {
      if (!urls.every((url) => typeof url === "string" && url.trim().length > 0)) {
        throw new Error("All items in media_urls must be non-empty strings");
      }
      return true;
    }),
];

/**
 * Validation rules for updating incident status
 */
const validateUpdateStatus = [
  body("status")
    .trim()
    .notEmpty()
    .withMessage("Status is required")
    .toLowerCase()
    .isIn(ALLOWED_STATUSES)
    .withMessage(`Status must be one of: ${ALLOWED_STATUSES.join(", ")}`),
];

/**
 * Validation rule for checking positive integer ID in route params
 */
const validateIncidentId = [
  param("id")
    .isInt({ min: 1 })
    .withMessage("Incident ID must be a positive integer"),
];

/**
 * Validation rules for nearby proximity searches
 */
const validateNearbyQuery = [
  query("latitude")
    .notEmpty()
    .withMessage("Latitude query parameter is required")
    .isFloat({ min: -90, max: 90 })
    .withMessage("Latitude must be a valid number between -90 and 90 degrees"),

  query("longitude")
    .notEmpty()
    .withMessage("Longitude query parameter is required")
    .isFloat({ min: -180, max: 180 })
    .withMessage("Longitude must be a valid number between -180 and 180 degrees"),

  query("radius")
    .optional()
    .isFloat({ min: 0.1, max: 500 })
    .withMessage("Radius must be a positive number between 0.1 and 500 km"),
];

module.exports = {
  ALLOWED_SEVERITIES,
  ALLOWED_STATUSES,
  handleValidationErrors,
  validateCreateIncident,
  validateUpdateStatus,
  validateIncidentId,
  validateNearbyQuery,
  // Ready-to-use middleware chains (rules + error handler)
  createIncidentValidator: [...validateCreateIncident, handleValidationErrors],
  updateStatusValidator: [...validateUpdateStatus, handleValidationErrors],
  incidentIdValidator: [...validateIncidentId, handleValidationErrors],
  nearbyQueryValidator: [...validateNearbyQuery, handleValidationErrors],
};
