const pool = require("../config/database");
const Incident = require("../models/incident");

const REQUIRED_COLUMNS = [
  "id",
  "title",
  "description",
  "category",
  "severity",
  "status",
  "latitude",
  "longitude",
  "address",
  "media_urls",
  "user_id",
  "is_anonymous",
  "created_at",
  "updated_at",
];

const REQUIRED_INDEXES = [
  "idx_incidents_status",
  "idx_incidents_severity",
  "idx_incidents_category",
  "idx_incidents_created_at",
  "idx_incidents_location",
  "idx_incidents_user_id",
];

async function runVerification() {
  console.log("=================================================================");
  console.log("       POSTGRESQL SIH_SAFETY DATABASE VERIFICATION SUITE       ");
  console.log("=================================================================\n");

  let testIncidentId = null;
  let passedCount = 0;
  let totalChecks = 11;

  function report(step, title, success, details = "") {
    const statusTag = success ? "[PASS]" : "[FAIL]";
    console.log(`${statusTag} Step ${step}: ${title}`);
    if (details) {
      console.log(`       ${details}`);
    }
    if (success) passedCount++;
  }

  try {
    // 1. PostgreSQL connection check
    const conn = await pool.testConnection();
    if (!conn.success) {
      report(1, "PostgreSQL connection", false, conn.message);
      console.log("\n=================================================================");
      console.log(" PostgreSQL server is not reachable on localhost:5432.");
      console.log(" Please ensure PostgreSQL service is started and credentials in .env are correct.");
      console.log("=================================================================");
      process.exit(1);
    }
    report(1, "PostgreSQL connected successfully", true, `Timestamp: ${conn.timestamp}`);

    // 2. Database name check
    const dbRes = await pool.query("SELECT current_database() AS db_name;");
    const currentDb = dbRes.rows[0].db_name;
    const isCorrectDb = currentDb === "sih_safety";
    report(
      2,
      "Database name verification",
      isCorrectDb,
      `Connected to database: '${currentDb}' (Expected: 'sih_safety')`
    );
    if (!isCorrectDb) {
      throw new Error(`Connected to '${currentDb}', expected 'sih_safety'. Check DB_NAME in .env.`);
    }

    // 3. Table incidents existence
    let tableRes = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'incidents';
    `);

    if (tableRes.rows.length === 0) {
      console.log("       Table 'incidents' not found. Initializing via Incident.initTable()...");
      await Incident.initTable();
      tableRes = await pool.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'incidents';
      `);
    }

    const tableExists = tableRes.rows.length > 0;
    report(3, "Table 'incidents' existence", tableExists, tableExists ? "Table 'incidents' exists in public schema." : "Table not found.");

    // 4. Verify fields
    const colsRes = await pool.query(`
      SELECT column_name, data_type, udt_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'incidents';
    `);
    const foundCols = colsRes.rows.map((r) => r.column_name);
    const missingCols = REQUIRED_COLUMNS.filter((c) => !foundCols.includes(c));
    const allColsPresent = missingCols.length === 0;

    report(
      4,
      "Table columns verification",
      allColsPresent,
      allColsPresent
        ? `All ${REQUIRED_COLUMNS.length} required fields exist: ${REQUIRED_COLUMNS.join(", ")}`
        : `Missing fields: ${missingCols.join(", ")}`
    );

    // 5. Verify constraints (catalog inspect & enforcement tests)
    const constraintsRes = await pool.query(`
      SELECT conname, pg_get_constraintdef(oid) as definition
      FROM pg_constraint
      WHERE conrelid = 'incidents'::regclass AND contype = 'c';
    `);
    const constraintDefs = constraintsRes.rows.map((r) => r.definition.toLowerCase());

    const hasSeverity = constraintDefs.some((d) => d.includes("severity") && d.includes("low") && d.includes("critical"));
    const hasStatus = constraintDefs.some((d) => d.includes("status") && d.includes("reported") && d.includes("dismissed"));
    const hasLat = constraintDefs.some((d) => d.includes("latitude") && d.includes("90"));
    const hasLng = constraintDefs.some((d) => d.includes("longitude") && d.includes("180"));

    // Also test constraint enforcement
    let constraintViolationsBlocked = true;
    try {
      await pool.query(`
        INSERT INTO incidents (title, description, category, severity, status, latitude, longitude)
        VALUES ('Test Invalid', 'Desc', 'hazard', 'invalid-severity', 'reported', 10, 20);
      `);
      constraintViolationsBlocked = false;
    } catch (e) {
      // Expected check violation
    }

    const constraintsValid = hasSeverity && hasStatus && hasLat && hasLng && constraintViolationsBlocked;
    report(
      5,
      "Constraints verification (severity, status, latitude, longitude)",
      constraintsValid,
      constraintsValid
        ? "Check constraints for severity, status, latitude (-90 to 90), and longitude (-180 to 180) are active and strictly enforced."
        : "Some check constraints are missing or unenforced."
    );

    // 6. Verify indexes
    const idxRes = await pool.query(`
      SELECT indexname 
      FROM pg_indexes 
      WHERE schemaname = 'public' AND tablename = 'incidents';
    `);
    const foundIndexes = idxRes.rows.map((r) => r.indexname);
    const missingIndexes = REQUIRED_INDEXES.filter((i) => !foundIndexes.includes(i));
    const allIndexesPresent = missingIndexes.length === 0;

    report(
      6,
      "Indexes verification",
      allIndexesPresent,
      allIndexesPresent
        ? `All 6 indexes verified: ${REQUIRED_INDEXES.join(", ")}`
        : `Missing indexes: ${missingIndexes.join(", ")}`
    );

    // 7. Test inserting one sample incident
    const sampleData = {
      title: "Temporary Verification Road Hazard",
      description: "Automated verification test incident for SIH backend.",
      category: "road_hazard",
      severity: "high",
      status: "reported",
      latitude: 28.6139,
      longitude: 77.209,
      address: "Connaught Place, New Delhi",
      media_urls: ["https://example.com/test-hazard.jpg"],
      user_id: "65f1a2b3c4d5e6f7a8b9c0d1",
      is_anonymous: false,
    };

    const createdIncident = await Incident.create(sampleData);
    testIncidentId = createdIncident?.id;
    const insertSuccess = Boolean(testIncidentId && createdIncident.title === sampleData.title);
    report(7, "Test inserting sample incident", insertSuccess, `Created incident ID: ${testIncidentId}`);

    // 8. Test fetching the incident
    const fetchedIncident = await Incident.findById(testIncidentId);
    const fetchSuccess = Boolean(fetchedIncident && fetchedIncident.id === testIncidentId);
    report(
      8,
      "Test fetching incident by ID",
      fetchSuccess,
      fetchSuccess ? `Fetched incident #${fetchedIncident.id} ('${fetchedIncident.title}')` : "Failed to fetch created incident."
    );

    // 9. Test nearby incident search (Haversine formula within 5km)
    const nearbyList = await Incident.findNearby(28.6139, 77.209, 5, 10);
    const nearbySuccess = Array.isArray(nearbyList) && nearbyList.some((i) => i.id === testIncidentId);
    report(
      9,
      "Test nearby incident search (Haversine)",
      nearbySuccess,
      nearbySuccess
        ? `Found ${nearbyList.length} nearby incident(s). Distance: ${nearbyList[0]?.distance_km?.toFixed(4) || 0} km`
        : "Failed to find sample incident within 5 km radius."
    );

    // 10. Test updating incident status
    const updatedIncident = await Incident.updateStatus(testIncidentId, "in_progress");
    const updateSuccess = updatedIncident?.status === "in_progress";
    report(
      10,
      "Test updating incident status",
      updateSuccess,
      updateSuccess ? `Incident status successfully updated to '${updatedIncident.status}'` : "Status update failed."
    );

    // 11. Test deleting the test incident & cleanup
    const deleteResult = await Incident.deleteById(testIncidentId);
    const verifyDeleted = await Incident.findById(testIncidentId);
    const deleteSuccess = deleteResult === true && verifyDeleted === null;
    report(
      11,
      "Test deleting test incident (Clean cleanup)",
      deleteSuccess,
      deleteSuccess ? `Incident #${testIncidentId} deleted. No temporary test data remains.` : "Failed to delete test incident."
    );

    console.log("\n=================================================================");
    console.log(` VERIFICATION SUMMARY: ${passedCount}/${totalChecks} CHECKS PASSED `);
    console.log("=================================================================");
  } catch (error) {
    console.error("\n[ERROR] Verification encountered an error:", error.message);
  } finally {
    // Failsafe cleanup if testIncidentId still exists
    if (testIncidentId) {
      try {
        await Incident.deleteById(testIncidentId);
      } catch (_) {}
    }
    await pool.end();
  }
}

if (require.main === module) {
  runVerification();
}

module.exports = runVerification;
