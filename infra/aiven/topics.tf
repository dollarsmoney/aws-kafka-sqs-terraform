# Topic catalog: add a topic here and run terraform apply.
locals {
  topics = {
    "orders.created"     = { partitions = 2, replication = 2 }
    "payments.completed" = { partitions = 2, replication = 2 }
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

# Adopts the pre-existing topic into state.
import {
  to = aiven_kafka_topic.this["orders.created"]
  id = "${var.aiven_project}/${var.kafka_service_name}/orders.created"
}
