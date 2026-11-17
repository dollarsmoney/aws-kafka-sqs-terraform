// All settings come from environment variables (set by docker-compose / EC2 user_data).

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

module.exports = {
  region: process.env.AWS_REGION || 'us-east-1',
  port: Number(process.env.PORT || 3000),

  // Getters: each role only needs some of these, and only fails if it reads one that's missing.
  kafka: {
    get brokers() {
      return required('KAFKA_BROKERS').split(',').map((b) => b.trim());
    },
    ssl: process.env.KAFKA_SSL === 'true', // TLS: MSK port 9094, Aiven, etc.
    // Optional mTLS (client-certificate auth, e.g. Aiven). Paths to PEM files.
    // Leave unset for MSK unauthenticated TLS: Node's built-in CA list already trusts Amazon.
    sslCaFile: process.env.KAFKA_SSL_CA_FILE,
    sslCertFile: process.env.KAFKA_SSL_CERT_FILE,
    sslKeyFile: process.env.KAFKA_SSL_KEY_FILE,
    clientId: process.env.KAFKA_CLIENT_ID || 'orders-pipeline',
    topic: process.env.ORDERS_TOPIC || 'orders.created',
    paymentsTopic: process.env.PAYMENTS_TOPIC || 'payments.completed',
    // Only true for local/dev. In production, topics come from Terraform.
    createTopics: process.env.KAFKA_CREATE_TOPICS === 'true',
    partitions: Number(process.env.KAFKA_PARTITIONS || 3),
    // -1 = let the broker use its default replication factor (handy on hosted Kafka like Aiven)
    replicationFactor: Number(process.env.KAFKA_REPLICATION_FACTOR || -1),
  },

  sqs: {
    get queueUrl() {
      return required('SQS_QUEUE_URL');
    },
    endpoint: process.env.SQS_ENDPOINT, // only set locally (ElasticMQ)
    // Must match the queue's redrive policy (Terraform max_receive_count / elasticmq.conf).
    // Only used to decide whether a failure log is "will retry" or "going to the DLQ".
    maxReceiveCount: Number(process.env.SQS_MAX_RECEIVE_COUNT || 3),
  },
};
