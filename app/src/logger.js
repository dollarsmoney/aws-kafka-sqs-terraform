// Structured JSON logs to stdout. Pretty-print locally with `| npx pino-pretty`.
const path = require('node:path');
const pino = require('pino');
const { logLevel } = require('kafkajs');

const service = process.env.SERVICE_NAME || path.basename(process.argv[1] || 'app', '.js');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: { service, env: process.env.APP_ENV || 'local' },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: { level: (label) => ({ level: label }) },
  redact: ['*.password', '*.token', '*.key', '*.cardNumber'],
});

// Route kafkajs internal logs through pino.
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
