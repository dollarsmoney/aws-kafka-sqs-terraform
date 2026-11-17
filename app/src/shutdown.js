// Run cleanup on SIGTERM/SIGINT (docker stop sends SIGTERM) so consumers leave their
// group cleanly and in-flight work finishes, instead of being killed mid-message.
const { logger } = require('./logger');

function onShutdown(cleanup) {
  let stopping = false;
  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.on(signal, async () => {
      if (stopping) return;
      stopping = true;
      logger.info({ event: 'app.stopping', signal }, 'shutting down');
      try {
        await cleanup();
      } catch (err) {
        logger.error({ event: 'app.cleanup_failed', err }, 'error during cleanup');
      }
      logger.info({ event: 'app.stopped' }, 'stopped');
      process.exit(0);
    });
  }
}

module.exports = { onShutdown };
