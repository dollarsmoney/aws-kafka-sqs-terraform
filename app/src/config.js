function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

module.exports = {
  region: process.env.AWS_REGION || 'us-east-1',
  port: Number(process.env.PORT || 3000),

  // Getters so each role only fails on the settings it actually uses.
  kafka: {
    get brokers() {
      return required('KAFKA_BROKERS').split(',').map((b) => b.trim());
    },
    ssl: process.env.KAFKA_SSL === 'true',
    sslCaFile: process.env.KAFKA_SSL_CA_FILE,
    sslCertFile: process.env.KAFKA_SSL_CERT_FILE,
    sslKeyFile: process.env.KAFKA_SSL_KEY_FILE,
    clientId: process.env.KAFKA_CLIENT_ID || 'orders-pipeline',
    topic: process.env.ORDERS_TOPIC || 'orders.created',
    paymentsTopic: process.env.PAYMENTS_TOPIC || 'payments.completed',
    createTopics: process.env.KAFKA_CREATE_TOPICS === 'true',
    partitions: Number(process.env.KAFKA_PARTITIONS || 3),
    replicationFactor: Number(process.env.KAFKA_REPLICATION_FACTOR || -1),
  },

  sqs: {
    get queueUrl() {
      return required('SQS_QUEUE_URL');
    },
    endpoint: process.env.SQS_ENDPOINT, // local ElasticMQ only
    maxReceiveCount: Number(process.env.SQS_MAX_RECEIVE_COUNT || 3),
  },
};
