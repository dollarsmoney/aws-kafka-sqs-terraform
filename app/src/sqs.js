const { SQSClient } = require('@aws-sdk/client-sqs');
const config = require('./config');

// Credentials come from the instance role on EC2; SQS_ENDPOINT targets ElasticMQ locally.
const sqs = new SQSClient({
  region: config.region,
  ...(config.sqs.endpoint && { endpoint: config.sqs.endpoint }),
});

module.exports = { sqs };
