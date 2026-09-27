const pool = require("../config/database");

/**
 * Incident Table DDL and Indexes Schema Definition
 */
const CREATE_TABLE_QUERY = `
  CREATE TABLE IF NOT EXISTS incidents (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    category VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'medium' 
      CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    status VARCHAR(30) NOT NULL DEFAULT 'reported' 
      CHECK (status IN ('reported', 'verified', 'in_progress', 'resolved', 'dismissed')),
    latitude DECIMAL(10, 8) NOT NULL 
      CHECK (latitude >= -90.0 AND latitude <= 90.0),
    longitude DECIMAL(11, 8) NOT NULL 
      CHECK (longitude >= -180.0 AND longitude <= 180.0),
    address TEXT,
    media_urls TEXT[] DEFAULT '{}',
    user_id TEXT,
    is_anonymous BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
  CREATE INDEX IF NOT EXISTS idx_incidents_severity ON incidents(severity);
  CREATE INDEX IF NOT EXISTS idx_incidents_category ON incidents(category);
  CREATE INDEX IF NOT EXISTS idx_incidents_created_at ON incidents(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_incidents_location ON incidents(latitude, longitude);
  CREATE INDEX IF NOT EXISTS idx_incidents_user_id ON incidents(user_id);
`;

const Incident = {
  /**
   * Initializes the incidents table and indexes in PostgreSQL if they do not exist
   * @returns {Promise<void>}
   */
  initTable: async () => {
    try {
      await pool.query(CREATE_TABLE_QUERY);
      console.log("Incidents table and indexes verified/created successfully.");
    } catch (error) {
      console.error("Failed to initialize incidents table:", error.message);
      throw error;
    }
  },

  /**
   * Creates a new incident report
   * @param {Object} data
   * @returns {Promise<Object>} Created incident record
   */
  create: async ({
    title,
    description,
    category,
    severity = "medium",
    status = "reported",
    latitude,
    longitude,
    address = null,
    media_urls = [],
    user_id = null,
    is_anonymous = false,
  }) => {
    const text = `
      INSERT INTO incidents (
        title, description, category, severity, status,
        latitude, longitude, address, media_urls, user_id, is_anonymous
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *;
    `;
    const values = [
      title,
      description,
      category,
      severity,
      status,
      latitude,
      longitude,
      address,
      media_urls,
      is_anonymous ? null : user_id,
      is_anonymous,
    ];

    const res = await pool.query(text, values);
    return res.rows[0];
  },

  /**
   * Finds an incident by primary key ID
   * @param {number|string} id
   * @returns {Promise<Object|null>}
   */
  findById: async (id) => {
    const text = `SELECT * FROM incidents WHERE id = $1;`;
    const res = await pool.query(text, [id]);
    return res.rows[0] || null;
  },

  /**
   * Finds incidents with optional filtering, sorting, and pagination
   * @param {Object} options
   * @returns {Promise<{incidents: Array, total: number}>}
   */
  findAll: async ({
    status,
    category,
    severity,
    user_id,
    limit = 20,
    offset = 0,
    orderBy = "created_at",
    orderDirection = "DESC",
  } = {}) => {
    const conditions = [];
    const values = [];

    if (status) {
      values.push(status);
      conditions.push(`status = $${values.length}`);
    }
    if (category) {
      values.push(category);
      conditions.push(`category = $${values.length}`);
    }
    if (severity) {
      values.push(severity);
      conditions.push(`severity = $${values.length}`);
    }
    if (user_id) {
      values.push(user_id);
      conditions.push(`user_id = $${values.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Safe sorting check against allowed columns
    const safeOrderCols = ["created_at", "updated_at", "severity", "status", "category"];
    const sortCol = safeOrderCols.includes(orderBy) ? orderBy : "created_at";
    const sortDir = orderDirection.toUpperCase() === "ASC" ? "ASC" : "DESC";

    const countQuery = `SELECT COUNT(*) as total FROM incidents ${whereClause};`;
    const countRes = await pool.query(countQuery, values);
    const total = parseInt(countRes.rows[0].total, 10);

    values.push(limit);
    const limitIndex = values.length;
    values.push(offset);
    const offsetIndex = values.length;

    const dataQuery = `
      SELECT * FROM incidents
      ${whereClause}
      ORDER BY ${sortCol} ${sortDir}
      LIMIT $${limitIndex} OFFSET $${offsetIndex};
    `;

    const dataRes = await pool.query(dataQuery, values);
    return {
      incidents: dataRes.rows,
      total,
      limit,
      offset,
    };
  },

  /**
   * Finds incidents within a given radius (in km) using Haversine distance
   * @param {number} latitude
   * @param {number} longitude
   * @param {number} radiusKm
   * @param {number} limit
   * @returns {Promise<Array>}
   */
  findNearby: async (latitude, longitude, radiusKm = 5, limit = 50) => {
    const text = `
      SELECT *,
        (6371 * acos(
          least(1.0, greatest(-1.0,
            cos(radians($1)) * cos(radians(latitude)) *
            cos(radians(longitude) - radians($2)) +
            sin(radians($1)) * sin(radians(latitude))
          ))
        )) AS distance_km
      FROM incidents
      WHERE (6371 * acos(
        least(1.0, greatest(-1.0,
          cos(radians($1)) * cos(radians(latitude)) *
          cos(radians(longitude) - radians($2)) +
          sin(radians($1)) * sin(radians(latitude))
        ))
      )) <= $3
      ORDER BY distance_km ASC
      LIMIT $4;
    `;
    const values = [latitude, longitude, radiusKm, limit];
    const res = await pool.query(text, values);
    return res.rows;
  },

  /**
   * Updates status of an incident
   * @param {number|string} id
   * @param {string} status
   * @returns {Promise<Object|null>}
   */
  updateStatus: async (id, status) => {
    const text = `
      UPDATE incidents
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *;
    `;
    const res = await pool.query(text, [status, id]);
    return res.rows[0] || null;
  },

  /**
   * Updates editable incident details
   * @param {number|string} id
   * @param {Object} updateData
   * @returns {Promise<Object|null>}
   */
  update: async (id, { title, description, category, severity, status, address, media_urls }) => {
    const updates = [];
    const values = [];

    const fieldMap = { title, description, category, severity, status, address, media_urls };
    for (const [key, value] of Object.entries(fieldMap)) {
      if (value !== undefined) {
        values.push(value);
        updates.push(`${key} = $${values.length}`);
      }
    }

    if (updates.length === 0) {
      return Incident.findById(id);
    }

    updates.push("updated_at = CURRENT_TIMESTAMP");
    values.push(id);

    const text = `
      UPDATE incidents
      SET ${updates.join(", ")}
      WHERE id = $${values.length}
      RETURNING *;
    `;

    const res = await pool.query(text, values);
    return res.rows[0] || null;
  },

  /**
   * Deletes an incident by ID
   * @param {number|string} id
   * @returns {Promise<boolean>}
   */
  deleteById: async (id) => {
    const text = `DELETE FROM incidents WHERE id = $1 RETURNING id;`;
    const res = await pool.query(text, [id]);
    return (res.rowCount || 0) > 0;
  },
};

module.exports = Incident;
