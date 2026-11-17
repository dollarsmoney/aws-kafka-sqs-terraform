// HTTP API: accepts orders and publishes an "order created" event to Kafka.
// It doesn't process anything itself; it only records that the event happened.
const express = require('express');
const { randomUUID } = require('node:crypto');
const config = require('./config');
const { kafka, ensureTopics } = require('./kafka');
const { onShutdown } = require('./shutdown');
const { logger } = require('./logger');

const producer = kafka.producer();
const app = express();
app.use(express.json());

// Access log: one line per HTTP request, with status and duration.
app.use((req, res, next) => {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    if (req.path === '/health') return; // health checks are noise
    logger.info(
      {
        event: 'http.request',
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: Number(process.hrtime.bigint() - start) / 1e6,
      },
      `${req.method} ${req.path} ${res.statusCode}`,
    );
  });
  next();
});

let ready = false;

app.get('/health', (_req, res) => {
  res.status(ready ? 200 : 503).json({ status: ready ? 'ok' : 'starting' });
});

app.post('/orders', async (req, res) => {
  const { customerId, amount, items = [], simulateFailure = false } = req.body ?? {};

  if (typeof customerId !== 'string' || customerId.length === 0) {
    return res.status(400).json({ error: 'customerId (string) is required' });
  }
  if (typeof amount !== 'number' || !(amount > 0)) {
    return res.status(400).json({ error: 'amount must be a positive number' });
  }

  const order = {
    orderId: randomUUID(),
    customerId,
    amount,
    items,
    simulateFailure: Boolean(simulateFailure), // set true to watch the message end up in the DLQ
    createdAt: new Date().toISOString(),
  };

  try {
    // The key decides the partition: every order for the same customer goes to the same
    // partition, so they're consumed in the order they were produced.
    const [result] = await producer.send({
      topic: config.kafka.topic,
      messages: [
        {
          key: customerId,
          value: JSON.stringify(order),
          headers: { 'event-type': 'order.created' },
        },
      ],
    });

    logger.info(
      {
        event: 'kafka.produced',
        topic: config.kafka.topic,
        partition: result.partition,
        offset: result.baseOffset,
        orderId: order.orderId,
        customerId,
      },
      'order.created published',
    );
    res.status(202).json({
      order,
      kafka: { topic: config.kafka.topic, partition: result.partition, offset: result.baseOffset },
    });
  } catch (err) {
    logger.error(
      { event: 'kafka.produce_failed', topic: config.kafka.topic, orderId: order.orderId, err },
      'could not publish order.created',
    );
    res.status(503).json({ error: 'could not publish order event' });
  }
});

async function main() {
  await ensureTopics([config.kafka.topic]);
  await producer.connect();
  ready = true;

  const server = app.listen(config.port, () =>
    logger.info({ event: 'app.started', port: config.port }, 'api listening'),
  );

  onShutdown(async () => {
    ready = false;
    await new Promise((resolve) => server.close(resolve));
    await producer.disconnect();
  });
}

main().catch((err) => {
  logger.fatal({ event: 'app.crashed', err }, 'api failed to start');
  process.exit(1); // Docker's restart policy will start us again
});
