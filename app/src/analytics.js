// A second, independent consumer group on the same topic.
//
// This is the key difference from SQS: in Kafka, every consumer *group* gets its own copy of every
// event (fan-out), and the event stays in the log after it's read. "sqs-forwarder" and
// "analytics" each see every order. Within one group, partitions are split between instances.
const config = require('./config');
const { kafka, ensureTopics } = require('./kafka');
const { onShutdown } = require('./shutdown');
const { logger } = require('./logger');

const consumer = kafka.consumer({ groupId: 'analytics' });

// One consumer can subscribe to several topics. Analytics wants both "order placed" and "order paid".
const stats = { orders: 0, ordered: 0, payments: 0, paid: 0 };

async function main() {
  const { topic: ordersTopic, paymentsTopic } = config.kafka;
  await ensureTopics([ordersTopic, paymentsTopic]);
  await consumer.connect();
  // fromBeginning: a brand-new group replays the whole retained log. Try deleting the group
  // (or renaming it) and restarting: it re-reads history. SQS can't do that.
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
      // Topics are shared: anyone with access can write anything. Ignore what we don't understand.
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
