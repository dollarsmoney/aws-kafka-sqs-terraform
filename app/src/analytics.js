// Independent consumer group reading both topics (Kafka fan-out).
const config = require('./config');
const { kafka, ensureTopics } = require('./kafka');
const { onShutdown } = require('./shutdown');
const { logger } = require('./logger');

const consumer = kafka.consumer({ groupId: 'analytics' });

const stats = { orders: 0, ordered: 0, payments: 0, paid: 0 };

async function main() {
  const { topic: ordersTopic, paymentsTopic } = config.kafka;
  await ensureTopics([ordersTopic, paymentsTopic]);
  await consumer.connect();
  await consumer.subscribe({ topics: [ordersTopic, paymentsTopic], fromBeginning: true });

  onShutdown(() => consumer.disconnect());

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      const where = { topic, partition, offset: message.offset, group: 'analytics' };
      let event;
      try {
        event = JSON.parse(message.value.toString());
      } catch {
        logger.error({ event: 'kafka.message_skipped', reason: 'unparseable', ...where }, 'skipping bad message');
        return;
      }
      if (typeof event?.orderId !== 'string' || typeof event.amount !== 'number') {
        logger.warn({ event: 'kafka.message_skipped', reason: 'unknown_shape', ...where }, 'skipping message');
        return;
      }

      if (topic === ordersTopic) {
        stats.orders += 1;
        stats.ordered += event.amount;
      } else {
        stats.payments += 1;
        stats.paid += event.amount;
      }

      logger.info(
        {
          event: 'kafka.consumed',
          ...where,
          orderId: event.orderId,
          totals: {
            orders: stats.orders,
            payments: stats.payments,
            orderedAmount: Number(stats.ordered.toFixed(2)),
            paidAmount: Number(stats.paid.toFixed(2)),
          },
        },
        topic === ordersTopic ? 'order.created counted' : 'payment.completed counted',
      );
    },
  });
}

main().catch((err) => {
  logger.fatal({ event: 'app.crashed', err }, 'analytics crashed');
  process.exit(1);
});
