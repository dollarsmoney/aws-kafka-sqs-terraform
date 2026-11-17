// SQS worker: processes order jobs and publishes payment.completed.
// Failed jobs are not deleted, so SQS retries them and moves them to the DLQ after maxReceiveCount.
const { ReceiveMessageCommand, DeleteMessageCommand } = require('@aws-sdk/client-sqs');
const config = require('./config');
const { sqs } = require('./sqs');
const { kafka, ensureTopics } = require('./kafka');
const { onShutdown } = require('./shutdown');
const { logger } = require('./logger');

const producer = kafka.producer();
const abort = new AbortController();
let running = true;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function processOrder(order) {
  await sleep(500); // simulated work
  if (order.simulateFailure) {
    throw new Error('simulated failure (payment declined)');
  }
}

async function handle(msg) {
  const attempt = Number(msg.Attributes?.ApproximateReceiveCount ?? 0);
  const ctx = { sqsMessageId: msg.MessageId, attempt };
  let order;
  try {
    order = JSON.parse(msg.Body);
    ctx.orderId = order.orderId;
    logger.debug({ event: 'sqs.received', ...ctx }, 'job received');
    await processOrder(order);

    // Publish before deleting the job so a publish failure causes a retry, not a lost event.
    const payment = {
      orderId: order.orderId,
      customerId: order.customerId,
      amount: order.amount,
      status: 'COMPLETED',
      paidAt: new Date().toISOString(),
    };
    const [result] = await producer.send({
      topic: config.kafka.paymentsTopic,
      messages: [
        {
          key: order.customerId,
          value: JSON.stringify(payment),
          headers: { 'event-type': 'payment.completed' },
        },
      ],
    });
    logger.info(
      {
        event: 'kafka.produced',
        topic: config.kafka.paymentsTopic,
        partition: result.partition,
        offset: result.baseOffset,
        ...ctx,
      },
      'payment.completed published',
    );

    await sqs.send(
      new DeleteMessageCommand({ QueueUrl: config.sqs.queueUrl, ReceiptHandle: msg.ReceiptHandle }),
    );
    logger.info({ event: 'sqs.deleted', ...ctx }, 'job done, removed from queue');
  } catch (err) {
    const lastAttempt = attempt >= config.sqs.maxReceiveCount;
    logger[lastAttempt ? 'error' : 'warn'](
      { event: 'job.failed', ...ctx, willRetry: !lastAttempt, err },
      lastAttempt
        ? 'job failed on final attempt, SQS will move it to the DLQ'
        : 'job failed, will retry after visibility timeout',
    );
  }
}

async function main() {
  const queueUrl = config.sqs.queueUrl;
  await ensureTopics([config.kafka.paymentsTopic]);
  await producer.connect();
  logger.info({ event: 'app.started', queueUrl }, 'worker polling SQS');

  onShutdown(async () => {
    running = false;
    abort.abort(); // cancel the in-flight long poll
    await producer.disconnect();
  });

  while (running) {
    let messages = [];
    try {
      const res = await sqs.send(
        new ReceiveMessageCommand({
          QueueUrl: queueUrl,
          MaxNumberOfMessages: 10,
          WaitTimeSeconds: 20,
          AttributeNames: ['ApproximateReceiveCount'],
          MessageAttributeNames: ['All'],
        }),
        { abortSignal: abort.signal },
      );
      messages = res.Messages ?? [];
    } catch (err) {
      if (!running) break;
      logger.error({ event: 'sqs.receive_failed', err }, 'receive failed, backing off 2s');
      await sleep(2000);
      continue;
    }

    await Promise.all(messages.map(handle));
  }
}

main().catch((err) => {
  logger.fatal({ event: 'app.crashed', err }, 'worker crashed');
  process.exit(1);
});
