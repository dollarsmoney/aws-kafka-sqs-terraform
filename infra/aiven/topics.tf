# ─────────────────────────────────────────────────────────────────────────────
#  Every Kafka topic lives here. New topic = add one line, open a PR,
#  then `terraform apply`. Apps never create topics themselves.
# ─────────────────────────────────────────────────────────────────────────────
locals {
  topics = {
    # name                 = settings
    "orders.created"     = { partitions = 2, replication = 2 } # api → forwarder, analytics
    "payments.completed" = { partitions = 2, replication = 2 } # worker → (future consumers)
  }

  default_retention_ms = 259200000 # 3 days
}

resource "aiven_kafka_topic" "this" {
  for_each = local.topics

  project      = var.aiven_project
  service_name = var.kafka_service_name
  topic_name   = each.key
  partitions   = each.value.partitions
  replication  = each.value.replication

  config {
    cleanup_policy      = "delete"
    retention_ms        = tostring(try(each.value.retention_ms, local.default_retention_ms))
    min_insync_replicas = "1"
  }
}

# orders.created already exists (the app created it before Terraform managed topics).
# This adopts it into Terraform state instead of trying to create it again.
# Safe to delete this block after the first successful apply.
import {
  to = aiven_kafka_topic.this["orders.created"]
  id = "${var.aiven_project}/${var.kafka_service_name}/orders.created"
}
