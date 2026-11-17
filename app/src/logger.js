// Structured JSON logging (pino). Production pattern:
//   - one JSON object per line on stdout. Docker/Kubernetes ship it to CloudWatch, Datadog, Loki...
//   - every line has `service`, so all services can share one log store
//   - business IDs (orderId) as fields, so you can trace one order across services
//   - level from LOG_LEVEL (debug|info|warn|error), changeable without a code change
//   - redact paths for anything sensitive (defence in depth; we don't log secrets anyway)
//
// Reading JSON logs locally:  docker compose ... logs -f | npx pino-pretty
const path = require('node:path');
const pino = require('pino');
const { logLevel } = require('kafkajs');

const service = process.env.SERVICE_NAME || path.basename(process.argv[1] || 'app', '.js');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: { service, env: process.env.APP_ENV || 'local' },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: { level: (label) => ({ level: label }) }, // "level":"info" instead of 30
  redact: ['*.password', '*.token', '*.key', '*.cardNumber'],
});

// Send kafkajs's own logs (connections, rebalances, retries) through the same logger,
// so they're JSON too and tagged with the service name.
function kafkaLogCreator() {
  const toPino = {
    [logLevel.ERROR]: 'error',
    [logLevel.WARN]: 'warn',
    [logLevel.INFO]: 'info',
    [logLevel.DEBUG]: 'debug',
  };
  const kafkaLog = logger.child({ component: 'kafkajs' });
  return ({ level, log }) => {
    const { message, timestamp, logger: _l, ...extra } = log;
    kafkaLog[toPino[level] || 'info'](extra, message);
  };
}

module.exports = { logger, kafkaLogCreator };
