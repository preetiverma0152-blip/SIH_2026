const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
require("dotenv").config();

const pool = require("./config/database");
const incidentRoutes = require("./routes/incidentRoutes");
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRouter");
const Incident = require("./models/incident");
const { notFoundHandler, errorHandler } = require("./middleware/errorMiddleware");

const app = express();

app.use(cors());
app.use(express.json());

// Health check
app.get("/", (req, res) => {
  res.json({
    message: "SIH Safety API is running",
    services: {
      authentication: "MongoDB",
      incidents: "PostgreSQL"
    }
  });
});

// Authentication APIs (MongoDB)
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);

// Incident APIs (PostgreSQL)
app.use("/api/incidents", incidentRoutes);

// Simple protected-route test
const { authenticate } = require("./middleware/authMiddleware");
app.get("/api/protected", authenticate, (req, res) => {
  res.json({
    message: "You can access this protected route",
    user: req.user
  });
});

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

const PORT = process.env.PORT || 8080;

async function startServer() {
  try {
    // MongoDB connection for authentication/users
    await mongoose.connect(
      process.env.MONGO_URI || "mongodb://127.0.0.1:27017/authDemo"
    );
    console.log("MongoDB connected successfully");

    // PostgreSQL connectivity + incident table
    const dbStatus = await pool.testConnection();
    if (!dbStatus.success) {
      console.warn(`[Database Warning] ${dbStatus.message}`);
    } else {
      console.log(`[PostgreSQL] Connected successfully at ${dbStatus.timestamp}`);
      await Incident.initTable();
    }

    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
      console.log(`Authentication: http://localhost:${PORT}/api/auth`);
      console.log(`Incidents:      http://localhost:${PORT}/api/incidents`);
    });
  } catch (error) {
    console.error("Server startup failed:", error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = app;
