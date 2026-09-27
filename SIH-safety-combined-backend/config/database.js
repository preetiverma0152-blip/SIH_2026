const { Pool } = require("pg");
require("dotenv").config();

// Determine configuration from DATABASE_URL or individual environment variables
const poolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl:
        process.env.DB_SSL === "true" || process.env.NODE_ENV === "production"
          ? { rejectUnauthorized: false }
          : false,
    }
  : {
      user: process.env.DB_USER || "postgres",
      host: process.env.DB_HOST || "localhost",
      database: process.env.DB_NAME || "sih_safety",
      password: process.env.DB_PASSWORD !== undefined ? String(process.env.DB_PASSWORD) : "",
      port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 5432,
      ssl:
        process.env.DB_SSL === "true"
          ? { rejectUnauthorized: false }
          : false,
    };

const pool = new Pool(poolConfig);

// Idle client error handling to prevent application crashes
pool.on("error", (err) => {
  console.error("Unexpected error on idle PostgreSQL client:", err.message);
});

// Store reference to native Pool query to prevent infinite recursion
const rawQuery = pool.query.bind(pool);

/**
 * Execute parameterized queries safely
 * @param {string} text - SQL query string
 * @param {Array} params - Query parameter values
 */
const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await rawQuery(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV === "development") {
      console.log("Executed query", { text, duration: `${duration}ms`, rows: res.rowCount });
    }
    return res;
  } catch (error) {
    console.error("Database query error:", { text, error: error.message });
    throw error;
  }
};

/**
 * Test database connectivity
 * @returns {Promise<{success: boolean, message: string, timestamp?: string}>}
 */
const testConnection = async () => {
  let client;
  try {
    client = await pool.connect();
    const res = await client.query("SELECT NOW() as current_time");
    return {
      success: true,
      message: "Database connection successful",
      timestamp: res.rows[0].current_time,
    };
  } catch (error) {
    const errorDetails =
      error.message ||
      error.code ||
      (Array.isArray(error.errors) ? error.errors.map((e) => e.message || e.code).join("; ") : null) ||
      "Unknown connection error";
    return {
      success: false,
      message: `Database connection failed: ${errorDetails}`,
    };
  } finally {
    if (client) client.release();
  }
};

// Export pool directly and as named properties for maximum flexibility
pool.query = query;
pool.testConnection = testConnection;

module.exports = pool;
module.exports.pool = pool;
module.exports.query = query;
module.exports.testConnection = testConnection;