process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test_integration_secret_key_98765";

const http = require("http");
const jwt = require("jsonwebtoken");
const app = require("../server");
const pool = require("../config/database");
const Incident = require("../models/incident");

// HTTP Request helper
function makeRequest(server, method, path, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const port = server.address().port;
    const reqOptions = {
      hostname: "127.0.0.1",
      port,
      path,
      method,
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
    };

    const req = http.request(reqOptions, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        let parsed = null;
        let isJson = false;
        try {
          parsed = JSON.parse(data);
          isJson = true;
        } catch (e) {
          parsed = data;
        }
        resolve({
          status: res.statusCode,
          contentType: res.headers["content-type"],
          isJson,
          body: parsed,
        });
      });
    });

    req.on("error", reject);
    if (body) {
      req.write(typeof body === "string" ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log("==========================================================");
  console.log("   INCIDENT API AUTOMATED TEST SUITE                     ");
  console.log("==========================================================");

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`[PASS] ${message}`);
      passed++;
    } else {
      console.error(`[FAIL] ${message}`);
      failed++;
    }
  }

  // Backup original Incident methods
  const origModel = { ...Incident };

  // Setup In-Memory Mock Store for model layer
  const mockDb = new Map();
  let nextId = 1;

  Incident.create = async (data) => {
    const record = { id: nextId++, ...data, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    mockDb.set(record.id, record);
    return record;
  };

  Incident.findById = async (id) => {
    return mockDb.get(Number(id)) || null;
  };

  Incident.findAll = async ({ status, category, severity, limit = 20, offset = 0 }) => {
    let list = Array.from(mockDb.values());
    if (status) list = list.filter((i) => i.status === status);
    if (category) list = list.filter((i) => i.category === category);
    if (severity) list = list.filter((i) => i.severity === severity);
    const total = list.length;
    const paginated = list.slice(offset, offset + limit);
    return { incidents: paginated, total, limit, offset };
  };

  Incident.update = async (id, data) => {
    const existing = mockDb.get(Number(id));
    if (!existing) return null;
    const updated = { ...existing, ...data, updated_at: new Date().toISOString() };
    mockDb.set(Number(id), updated);
    return updated;
  };

  Incident.deleteById = async (id) => {
    return mockDb.delete(Number(id));
  };

  Incident.findNearby = async (lat, lng, radius, limit) => {
    return Array.from(mockDb.values()).slice(0, limit);
  };

  const server = http.createServer(app);
  await new Promise((res) => server.listen(0, "127.0.0.1", res));

  const validToken = jwt.sign({ id: 99, role: "responder" }, process.env.JWT_SECRET);
  const expiredToken = jwt.sign({ id: 99, role: "responder" }, process.env.JWT_SECRET, { expiresIn: "-1s" });
  const authHeader = { Authorization: `Bearer ${validToken}` };

  try {
    // 1. Root health check
    const rootRes = await makeRequest(server, "GET", "/");
    assert(
      rootRes.status === 200 &&
        (rootRes.body?.message === "Incident API is running" ||
          rootRes.body?.message === "SIH Safety API is running"),
      "GET / returns HTTP 200 OK"
    );

    // 2. Missing required fields
    const missingRes = await makeRequest(server, "POST", "/api/incidents", {}, {});
    assert(missingRes.status === 400 && missingRes.body?.success === false, "POST /api/incidents (Missing fields) returns HTTP 400 Bad Request");

    // 3. Invalid field values
    const invalidValuesRes = await makeRequest(server, "POST", "/api/incidents", {}, {
      title: "Hi",
      description: "Bad",
      category: "",
      severity: "super-extreme",
      latitude: 105,
      longitude: -200,
    });
    assert(invalidValuesRes.status === 400 && invalidValuesRes.body?.errors?.length > 0, "POST /api/incidents (Invalid values) returns HTTP 400 Bad Request");

    // 4. Invalid incident ID
    const invalidIdRes = await makeRequest(server, "GET", "/api/incidents/not-an-id");
    assert(invalidIdRes.status === 400, "GET /api/incidents/not-an-id returns HTTP 400 Bad Request");

    // 5. Unauthorized request
    const unauthPut = await makeRequest(server, "PUT", "/api/incidents/1", {}, { title: "Title" });
    assert(unauthPut.status === 401, "PUT /api/incidents/1 (Missing token) returns HTTP 401 Unauthorized");

    const unauthDelete = await makeRequest(server, "DELETE", "/api/incidents/1");
    assert(unauthDelete.status === 401, "DELETE /api/incidents/1 (Missing token) returns HTTP 401 Unauthorized");

    // 6. Invalid authentication token
    const badTokenPut = await makeRequest(server, "PUT", "/api/incidents/1", { Authorization: "Bearer bad.token" }, { title: "Title" });
    assert(badTokenPut.status === 401, "PUT /api/incidents/1 (Invalid token) returns HTTP 401 Unauthorized");

    const expiredTokenPut = await makeRequest(server, "PUT", "/api/incidents/1", { Authorization: `Bearer ${expiredToken}` }, { title: "Title" });
    assert(expiredTokenPut.status === 401, "PUT /api/incidents/1 (Expired token) returns HTTP 401 Unauthorized");

    // 7. Valid request flow (Create, Read All, Read by ID, Update, Delete)
    const validCreateRes = await makeRequest(server, "POST", "/api/incidents", authHeader, {
      title: "Active Hazard Reported",
      description: "Streetlight outage on dark road creating hazard for pedestrians.",
      category: "hazard",
      severity: "high",
      latitude: 28.6139,
      longitude: 77.209,
      address: "Crossroad 4, Sector B",
    });
    assert(validCreateRes.status === 201 && validCreateRes.body?.data?.id === 1, "POST /api/incidents (Valid request) returns HTTP 201 Created");

    const getByIdRes = await makeRequest(server, "GET", "/api/incidents/1");
    assert(getByIdRes.status === 200 && getByIdRes.body?.data?.id === 1, "GET /api/incidents/1 (Valid request) returns HTTP 200 OK");

    const getAllRes = await makeRequest(server, "GET", "/api/incidents");
    assert(getAllRes.status === 200 && getAllRes.body?.data?.length === 1, "GET /api/incidents (Valid request) returns HTTP 200 OK");

    const updateRes = await makeRequest(server, "PUT", "/api/incidents/1", authHeader, { title: "Resolved Hazard" });
    assert(updateRes.status === 200 && updateRes.body?.data?.title === "Resolved Hazard", "PUT /api/incidents/1 (Valid request) returns HTTP 200 OK");

    const deleteRes = await makeRequest(server, "DELETE", "/api/incidents/1", authHeader);
    assert(deleteRes.status === 200 && deleteRes.body?.data?.id === 1, "DELETE /api/incidents/1 (Valid request) returns HTTP 200 OK");

    // 8. Nonexistent incident
    const nonexistentRes = await makeRequest(server, "GET", "/api/incidents/9999");
    assert(nonexistentRes.status === 404 && nonexistentRes.body?.success === false, "GET /api/incidents/9999 (Nonexistent incident) returns HTTP 404 Not Found");

    // 9. Database failure handling
    Incident.findAll = async () => {
      const err = new Error("Connection terminated unexpectedly");
      err.code = "ECONNREFUSED";
      throw err;
    };

    const dbFailRes = await makeRequest(server, "GET", "/api/incidents");
    assert(dbFailRes.status === 503 && dbFailRes.body?.message?.includes("Database service is temporarily unavailable"), "GET /api/incidents (Database failure handling) returns HTTP 503 Service Unavailable");

  } finally {
    Object.assign(Incident, origModel);
    server.close();
  }

  console.log("\n==========================================================");
  console.log(`   TEST SUITE SUMMARY: ${passed} passed, ${failed} failed `);
  console.log("==========================================================");

  if (failed > 0) process.exit(1);
}

runTests();
