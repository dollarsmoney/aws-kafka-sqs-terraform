// SQS worker: pulls jobs off the queue and "fulfils" orders.
//
// SQS is a work queue: each message goes to ONE consumer (competing consumers). Run 3 workers
// and they share the load. Nothing is fanned out.
//
// Lifecycle of a message:
//   ReceiveMessage -> message becomes invisible for the visibility timeout (10s in Terraform)
//   success        -> DeleteMessage (otherwise it comes back!)
//   failure        -> don't delete; it reappears after the timeout and is retried
//   3rd failure    -> SQS moves it to the DLQ (redrive policy maxReceiveCount=3)
//
// On success, the worker also announces "payment completed" on Kafka so other services
// (emails, shipping, analytics...) can react, without the worker knowing who they are.
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
  await sleep(500); // pretend to charge a card, reserve stock, etc.
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

    // Publish BEFORE deleting the SQS message: if publishing fails, the job is retried,
    // so the event is never lost (at worst it's sent twice, which is "at least once" again).
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
    // warn on early attempts (it will be retried), error on the last one (next stop: DLQ)
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
    abort.abort(); // cancel an in-progress 20s long poll so we exit quickly
    await producer.disconnect();
  });

  while (running) {
    let messages = [];
    try {
      const res = await sqs.send(
        new ReceiveMessageCommand({
          QueueUrl: queueUrl,
          MaxNumberOfMessages: 10,
          WaitTimeSeconds: 20, // long polling: fewer empty responses, cheaper
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
