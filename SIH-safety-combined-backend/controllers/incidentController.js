
const incidentService = require("../services/incidentService");

/**
 * Incident Controller
 * Handles HTTP requests, extracts parameters, invokes the service layer,
 * formats uniform JSON responses, and delegates errors to errorMiddleware.
 */
const incidentController = {
  /**
   * Handle creation of a new safety incident
   * POST /api/incidents
   */
  createIncident: async (req, res, next) => {
    try {
      const payload = {
        ...req.body,
        user_id: req.body.user_id || req.body.reportedBy || req.user?.userId,
      };

      const newIncident = await incidentService.createIncident(payload);

      return res.status(201).json({
        success: true,
        message: "Incident reported successfully",
        data: newIncident,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Handle retrieving all incidents with optional filtering & pagination
   * GET /api/incidents
   */
  getAllIncidents: async (req, res, next) => {
    try {
      const result = await incidentService.getAllIncidents(req.query);

      return res.status(200).json({
        success: true,
        message: "Incidents retrieved successfully",
        data: result.incidents,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Handle retrieving an incident by ID
   * GET /api/incidents/:id
   */
  getIncidentById: async (req, res, next) => {
    try {
      const { id } = req.params;
      const incident = await incidentService.getIncidentById(id);

      return res.status(200).json({
        success: true,
        message: "Incident retrieved successfully",
        data: incident,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Handle updating an incident
   * PUT /api/incidents/:id or PATCH /api/incidents/:id
   */
  updateIncident: async (req, res, next) => {
    try {
      const { id } = req.params;
      const updatedIncident = await incidentService.updateIncident(id, req.body);

      return res.status(200).json({
        success: true,
        message: "Incident updated successfully",
        data: updatedIncident,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Handle deleting an incident
   * DELETE /api/incidents/:id
   */
  deleteIncident: async (req, res, next) => {
    try {
      const { id } = req.params;
      const result = await incidentService.deleteIncident(id);

      return res.status(200).json({
        success: true,
        message: result.message,
        data: { id: result.deletedId },
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Handle updating only the status of an incident
   * PATCH /api/incidents/:id/status
   */
  updateIncidentStatus: async (req, res, next) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const updatedIncident = await incidentService.updateIncidentStatus(id, status);

      return res.status(200).json({
        success: true,
        message: "Incident status updated successfully",
        data: updatedIncident,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Handle nearby proximity incident searches
   * GET /api/incidents/nearby
   */
  getNearbyIncidents: async (req, res, next) => {
    try {
      const { latitude, longitude, radius, limit } = req.query;
      const incidents = await incidentService.getNearbyIncidents(
        latitude,
        longitude,
        radius,
        limit
      );

      return res.status(200).json({
        success: true,
        message: "Nearby incidents retrieved successfully",
        data: incidents,
        count: incidents.length,
      });
    } catch (error) {
      next(error);
    }
  },
};

module.exports = incidentController;
