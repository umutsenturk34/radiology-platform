/**
 * Runs before the Nest modules are imported.
 *
 * Pins the log level so the suite behaves the same on a developer machine (whose
 * .env may set LOG_LEVEL=debug) as it does in CI, and keeps the output readable.
 * @nestjs/config never overwrites an already-set process.env value, so this wins
 * over .env.
 */
process.env.LOG_LEVEL = 'error';

// Dev tools are on by default for the suite; the dev-tools spec flips the flag
// itself to prove both sides of the gate.
process.env.DEV_TOOLS_ENABLED = 'true';
// Keep the mock adapter's simulated timeout short so retry tests stay fast.
process.env.MOCK_HBYS_TIMEOUT_DELAY_MS = '1';

/**
 * A long lock TTL for the e2e suite.
 *
 * Nothing here waits for a lock to expire — TTL semantics are owned by the unit
 * tests, which drive a controlled clock. With the production 60s value an HTTP
 * suite is racing the wall clock: a GC pause or a loaded machine between
 * acquiring a lock and asserting on it can expire it and fail a test that has
 * nothing to do with expiry. Ten minutes removes that class of flakiness
 * without weakening a single assertion.
 */
process.env.LOCK_TTL_SECONDS = '600';
process.env.LOCK_HEARTBEAT_SECONDS = '20';
