// Kafka -> SQS bridge. Offsets commit only after the SQS send succeeds (at-least-once).
const { SendMessageCommand } = require('@aws-sdk/client-sqs');
const config = require('./config');
const { kafka, ensureTopics } = require('./kafka');
const { sqs } = require('./sqs');
const { onShutdown } = require('./shutdown');
const { logger } = require('./logger');

const consumer = kafka.consumer({ groupId: 'sqs-forwarder' });

async function main() {
  await ensureTopics([config.kafka.topic]);
  await consumer.connect();
  await consumer.subscribe({ topic: config.kafka.topic, fromBeginning: true });

  onShutdown(() => consumer.disconnect());

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      const where = { topic, partition, offset: message.offset, group: 'sqs-forwarder' };
      let order;
      try {
        order = JSON.parse(message.value.toString());
      } catch {
        // Skip poison messages instead of blocking the partition.
        logger.error({ event: 'kafka.message_skipped', reason: 'unparseable', ...where }, 'skipping bad message');
        return;
      }
      if (typeof order?.orderId !== 'string') {
        logger.warn({ event: 'kafka.message_skipped', reason: 'not_an_order', ...where }, 'skipping non-order message');
        return;
      }
      logger.debug({ event: 'kafka.consumed', ...where, orderId: order.orderId }, 'order.created received');

      const sent = await sqs.send(
        new SendMessageCommand({
          QueueUrl: config.sqs.queueUrl,
          MessageBody: JSON.stringify(order),
          MessageAttributes: {
            source: { DataType: 'String', StringValue: `kafka:${config.kafka.topic}` },
          },
        }),
      );

      logger.info(
        { event: 'sqs.sent', ...where, orderId: order.orderId, sqsMessageId: sent.MessageId },
        'order forwarded from Kafka to SQS',
      );
    },
  });
}

main().catch((err) => {
  logger.fatal({ event: 'app.crashed', err }, 'forwarder crashed');
  process.exit(1);
});
