const createApp = require('./app');
const env = require('./config/env');
const logger = require('./utils/logger');
const { connectDB } = require('./config/db');

async function start() {
  try {
    await connectDB();
    const app = createApp();

    const server = app.listen(env.PORT, () => {
      logger.info(`PsyFusion AI backend listening on port ${env.PORT} [${env.NODE_ENV}]`);
    });

    const shutdown = (signal) => {
      logger.info(`${signal} received, shutting down gracefully`);
      server.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
      });
      // Force exit if graceful shutdown hangs
      setTimeout(() => process.exit(1), 10000).unref();
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    logger.error(`Failed to start server: ${err.message}`, { stack: err.stack });
    process.exit(1);
  }
}

start();
