/**
 * Runs before the Nest modules are imported.
 *
 * Pins the log level so the suite behaves the same on a developer machine (whose
 * .env may set LOG_LEVEL=debug) as it does in CI, and keeps the output readable.
 * @nestjs/config never overwrites an already-set process.env value, so this wins
 * over .env.
 */
process.env.LOG_LEVEL = 'error';
