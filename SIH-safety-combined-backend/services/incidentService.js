const Incident = require("../models/incident");

/**
 * Custom error types for service layer operations
 */
class ServiceError extends Error {
  constructor(message, statusCode = 500, code = null) {
    super(message);
    this.name = "ServiceError";
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
  }
}

class NotFoundError extends ServiceError {
  constructor(message = "Resource not found") {
    super(message, 404);
    this.name = "NotFoundError";
  }
}

class BadRequestError extends ServiceError {
  constructor(message = "Invalid input") {
    super(message, 400);
    this.name = "BadRequestError";
  }
}

/**
 * Validates and converts an ID into a positive integer
 * @param {any} id
 * @returns {number}
 * @throws {BadRequestError}
 */
const validateId = (id) => {
  const parsedId = Number(id);
  if (!Number.isInteger(parsedId) || parsedId <= 0) {
    throw new BadRequestError("Invalid incident ID. Must be a positive integer.");
  }
  return parsedId;
};

/**
 * Incident Service Layer
 * Encapsulates business rules, data preparation, and database operations.
 * Pure service functions: does not use req/res or send HTTP responses.
 */
const incidentService = {
  /**
   * Creates a new safety incident report
   * @param {Object} incidentData
   * @returns {Promise<Object>} Created incident record
   */
  createIncident: async (incidentData) => {
    try {
      if (!incidentData || typeof incidentData !== "object") {
        throw new BadRequestError("Incident data payload is required.");
      }

      // Normalize coordinates & location fields if passed inside a location object
      const latitude =
        incidentData.latitude !== undefined
          ? incidentData.latitude
          : incidentData.location?.latitude;
      const longitude =
        incidentData.longitude !== undefined
          ? incidentData.longitude
          : incidentData.location?.longitude;
      const address =
        incidentData.address !== undefined
          ? incidentData.address
          : incidentData.location?.address || null;

      // Handle user / reporter mapping & anonymous reporting
      const isAnonymous = Boolean(incidentData.is_anonymous);
      const userId = isAnonymous
        ? null
        : incidentData.user_id || incidentData.reportedBy || null;

      const payload = {
        title: incidentData.title?.trim(),
        description: incidentData.description?.trim(),
        category: incidentData.category?.trim(),
        severity: incidentData.severity ? incidentData.severity.toLowerCase().trim() : "medium",
        status: incidentData.status ? incidentData.status.toLowerCase().trim() : "reported",
        latitude: Number(latitude),
        longitude: Number(longitude),
        address,
        media_urls: Array.isArray(incidentData.media_urls) ? incidentData.media_urls : [],
        user_id: userId ? String(userId).trim() : null,
        is_anonymous: isAnonymous,
      };

      const newIncident = await Incident.create(payload);
      return newIncident;
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      throw new ServiceError(`Failed to create incident: ${error.message}`, 500, error.code);
    }
  },

  /**
   * Retrieves all incidents with optional filtering and pagination
   * @param {Object} queryOptions
   * @returns {Promise<{incidents: Array, pagination: Object}>}
   */
  getAllIncidents: async (queryOptions = {}) => {
    try {
      const page = Math.max(1, parseInt(queryOptions.page, 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(queryOptions.limit, 10) || 20));
      const offset =
        queryOptions.offset !== undefined
          ? Math.max(0, parseInt(queryOptions.offset, 10))
          : (page - 1) * limit;

      const filterOptions = {
        status: queryOptions.status ? queryOptions.status.toLowerCase().trim() : undefined,
        category: queryOptions.category ? queryOptions.category.toLowerCase().trim() : undefined,
        severity: queryOptions.severity ? queryOptions.severity.toLowerCase().trim() : undefined,
        user_id: queryOptions.user_id ? String(queryOptions.user_id).trim() : undefined,
        limit,
        offset,
        orderBy: queryOptions.orderBy || "created_at",
        orderDirection: queryOptions.orderDirection || "DESC",
      };

      const result = await Incident.findAll(filterOptions);

      const total = result.total || 0;
      const totalPages = Math.ceil(total / limit) || 1;

      return {
        incidents: result.incidents,
        pagination: {
          total,
          limit,
          offset,
          currentPage: page,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
      };
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      throw new ServiceError(`Failed to retrieve incidents: ${error.message}`, 500, error.code);
    }
  },

  /**
   * Retrieves a single incident by its ID
   * @param {number|string} id
   * @returns {Promise<Object>}
   * @throws {BadRequestError|NotFoundError}
   */
  getIncidentById: async (id) => {
    try {
      const parsedId = validateId(id);
      const incident = await Incident.findById(parsedId);

      if (!incident) {
        throw new NotFoundError(`Incident with ID ${parsedId} not found.`);
      }

      return incident;
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      throw new ServiceError(`Failed to retrieve incident: ${error.message}`, 500, error.code);
    }
  },

  /**
   * Updates an existing incident
   * @param {number|string} id
   * @param {Object} updateData
   * @returns {Promise<Object>} Updated incident record
   * @throws {BadRequestError|NotFoundError}
   */
  updateIncident: async (id, updateData = {}) => {
    try {
      const parsedId = validateId(id);

      if (!updateData || typeof updateData !== "object" || Object.keys(updateData).length === 0) {
        throw new BadRequestError("Update payload cannot be empty.");
      }

      // Verify existence first
      const existing = await Incident.findById(parsedId);
      if (!existing) {
        throw new NotFoundError(`Incident with ID ${parsedId} not found.`);
      }

      // Prepare and sanitize fields allowed to be updated
      const allowedFields = {};

      if (updateData.title !== undefined) allowedFields.title = updateData.title.trim();
      if (updateData.description !== undefined) allowedFields.description = updateData.description.trim();
      if (updateData.category !== undefined) allowedFields.category = updateData.category.trim();
      if (updateData.severity !== undefined) allowedFields.severity = updateData.severity.toLowerCase().trim();
      if (updateData.status !== undefined) allowedFields.status = updateData.status.toLowerCase().trim();
      if (updateData.address !== undefined) allowedFields.address = updateData.address;
      if (updateData.location?.address !== undefined) allowedFields.address = updateData.location.address;
      if (Array.isArray(updateData.media_urls)) allowedFields.media_urls = updateData.media_urls;

      const updatedIncident = await Incident.update(parsedId, allowedFields);
      return updatedIncident;
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      throw new ServiceError(`Failed to update incident: ${error.message}`, 500, error.code);
    }
  },

  /**
   * Deletes an incident by ID
   * @param {number|string} id
   * @returns {Promise<{success: boolean, message: string, deletedId: number}>}
   * @throws {BadRequestError|NotFoundError}
   */
  deleteIncident: async (id) => {
    try {
      const parsedId = validateId(id);

      // Verify existence before deletion
      const existing = await Incident.findById(parsedId);
      if (!existing) {
        throw new NotFoundError(`Incident with ID ${parsedId} not found.`);
      }

      const isDeleted = await Incident.deleteById(parsedId);
      if (!isDeleted) {
        throw new ServiceError(`Failed to delete incident with ID ${parsedId}.`, 500);
      }

      return {
        success: true,
        message: `Incident with ID ${parsedId} deleted successfully.`,
        deletedId: parsedId,
      };
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      throw new ServiceError(`Failed to delete incident: ${error.message}`, 500, error.code);
    }
  },

  /**
   * Updates only the status of an incident (workflow transition)
   * @param {number|string} id
   * @param {string} status
   * @returns {Promise<Object>} Updated incident record
   * @throws {BadRequestError|NotFoundError}
   */
  updateIncidentStatus: async (id, status) => {
    try {
      const parsedId = validateId(id);

      if (!status || typeof status !== "string") {
        throw new BadRequestError("Status string is required.");
      }

      const existing = await Incident.findById(parsedId);
      if (!existing) {
        throw new NotFoundError(`Incident with ID ${parsedId} not found.`);
      }

      const updatedIncident = await Incident.updateStatus(parsedId, status.toLowerCase().trim());
      return updatedIncident;
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      throw new ServiceError(`Failed to update incident status: ${error.message}`, 500, error.code);
    }
  },

  /**
   * Retrieves incidents nearby a geographic coordinate
   * @param {number|string} latitude
   * @param {number|string} longitude
   * @param {number|string} radiusKm
   * @param {number|string} limit
   * @returns {Promise<Array>}
   */
  getNearbyIncidents: async (latitude, longitude, radiusKm = 5, limit = 50) => {
    try {
      const lat = Number(latitude);
      const lng = Number(longitude);
      const radius = Number(radiusKm) || 5;
      const count = Number(limit) || 50;

      if (isNaN(lat) || lat < -90 || lat > 90) {
        throw new BadRequestError("Latitude must be a valid number between -90 and 90.");
      }
      if (isNaN(lng) || lng < -180 || lng > 180) {
        throw new BadRequestError("Longitude must be a valid number between -180 and 180.");
      }

      return await Incident.findNearby(lat, lng, radius, count);
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      throw new ServiceError(`Failed to retrieve nearby incidents: ${error.message}`, 500, error.code);
    }
  },
};

module.exports = incidentService;
module.exports.ServiceError = ServiceError;
module.exports.NotFoundError = NotFoundError;
module.exports.BadRequestError = BadRequestError;
