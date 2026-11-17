# A work queue plus its dead-letter queue (DLQ).
# A message that fails processing `max_receive_count` times gets moved to the DLQ
# so it stops blocking the queue, and you can look at it later.

resource "aws_sqs_queue" "dlq" {
  name                      = "${var.name}-dlq"
  message_retention_seconds = 1209600 # 14 days (the max): gives you time to look at failures
  sqs_managed_sse_enabled   = true
}

resource "aws_sqs_queue" "main" {
  name = var.name

  # After a consumer receives a message, it stays hidden from other consumers for this long.
  # If the consumer doesn't delete it in time, it becomes visible again and gets retried.
  visibility_timeout_seconds = var.visibility_timeout_seconds

  # Long polling: ReceiveMessage waits up to 20s for messages instead of returning empty right away.
  receive_wait_time_seconds = 20

  message_retention_seconds = 345600 # 4 days
  sqs_managed_sse_enabled   = true

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq.arn
    maxReceiveCount     = var.max_receive_count
  })
}

# Only our main queue is allowed to use this DLQ.
resource "aws_sqs_queue_redrive_allow_policy" "dlq" {
  queue_url = aws_sqs_queue.dlq.id

  redrive_allow_policy = jsonencode({
    redrivePermission = "byQueue"
    sourceQueueArns   = [aws_sqs_queue.main.arn]
  })
}
