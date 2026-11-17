const fs = require('node:fs');
process.env.KAFKAJS_NO_PARTITIONER_WARNING ??= '1';
const { Kafka, logLevel } = require('kafkajs');
const config = require('./config');
const { logger, kafkaLogCreator } = require('./logger');

// false = plaintext (local), true = TLS (MSK), { ca, cert, key } = mutual TLS (Aiven)
function buildSsl() {
  const { ssl, sslCaFile, sslCertFile, sslKeyFile } = config.kafka;
  if (!ssl) return false;
  if (!sslCaFile && !sslCertFile && !sslKeyFile) return true;
  return {
    rejectUnauthorized: true,
    ...(sslCaFile && { ca: [fs.readFileSync(sslCaFile, 'utf8')] }),
    ...(sslCertFile && { cert: fs.readFileSync(sslCertFile, 'utf8') }),
    ...(sslKeyFile && { key: fs.readFileSync(sslKeyFile, 'utf8') }),
  };
}

const kafka = new Kafka({
  clientId: config.kafka.clientId,
  brokers: config.kafka.brokers,
  ssl: buildSsl(),
  logLevel: logLevel.WARN,
  logCreator: kafkaLogCreator,
  retry: { initialRetryTime: 300, retries: 10 },
});

// Fails fast if topics are missing. Creates them only when KAFKA_CREATE_TOPICS=true (local dev);
// otherwise topics are owned by Terraform.
async function ensureTopics(topics) {
  const { createTopics, partitions, replicationFactor } = config.kafka;
  const admin = kafka.admin();
  await admin.connect();
  try {
    const existing = new Set(await admin.listTopics());
    const missing = topics.filter((t) => !existing.has(t));

    if (missing.length === 0) {
      logger.info({ event: 'kafka.topics_ok', topics }, 'required topics exist');
      return;
    }

    if (!createTopics) {
      throw new Error(
        `Kafka topic(s) missing: ${missing.join(', ')}. ` +
          'Create them with Terraform (infra/aiven/topics.tf), or set KAFKA_CREATE_TOPICS=true for local dev.',
      );
    }

    try {
      await admin.createTopics({
        waitForLeaders: true,
        topics: missing.map((topic) => ({ topic, numPartitions: partitions, replicationFactor })),
      });
      logger.info({ event: 'kafka.topics_created', topics: missing, partitions }, 'created missing topics');
    } catch (err) {
      if (err.type !== 'TOPIC_ALREADY_EXISTS') throw err;
    }
  } finally {
    await admin.disconnect();
  }
}

module.exports = { kafka, ensureTopics };
