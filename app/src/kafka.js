const fs = require('node:fs');
// We use kafkajs v2's default partitioner on purpose; silence its one-time migration notice.
process.env.KAFKAJS_NO_PARTITIONER_WARNING ??= '1';
const { Kafka, logLevel } = require('kafkajs');
const config = require('./config');
const { logger, kafkaLogCreator } = require('./logger');

// Three ways to connect:
//   ssl: false                  -> plaintext (local docker Kafka)
//   ssl: true                   -> TLS, server checked against Node's CA list (MSK unauthenticated TLS)
//   ssl: { ca, cert, key }      -> mutual TLS: we also present a client certificate (Aiven)
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
  logLevel: logLevel.WARN, // kafkajs internals: only warnings/errors, so they don't drown out our logs
  logCreator: kafkaLogCreator,
  retry: { initialRetryTime: 300, retries: 10 },
});

// Called by every role at startup with the topics it uses.
//
// Production (KAFKA_CREATE_TOPICS unset/false): topics are owned by Terraform
// (infra/aiven/topics.tf). The app only CHECKS they exist and fails fast with a clear
// message if not. Its Kafka user usually isn't even allowed to create topics.
//
// Dev convenience (KAFKA_CREATE_TOPICS=true): create missing topics. Used for local
// Docker Kafka and MSK, where nothing else manages topics in this project.
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
      // Two roles can race to create the same topic; losing the race is fine.
      if (err.type !== 'TOPIC_ALREADY_EXISTS') throw err;
    }
  } finally {
    await admin.disconnect();
  }
}

module.exports = { kafka, ensureTopics };
