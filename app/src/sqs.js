const { SQSClient } = require('@aws-sdk/client-sqs');
const config = require('./config');

// On EC2, credentials come from the instance role through IMDS (no keys in the container).
// Locally, SQS_ENDPOINT points at ElasticMQ, and dummy keys are set in docker-compose.local.yml.
const sqs = new SQSClient({
  region: config.region,
  ...(config.sqs.endpoint && { endpoint: config.sqs.endpoint }),
});

module.exports = { sqs };
