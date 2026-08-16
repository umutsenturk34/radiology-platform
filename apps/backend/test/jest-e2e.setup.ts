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
