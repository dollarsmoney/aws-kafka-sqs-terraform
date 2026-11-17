output "topics" {
  description = "Topics managed by Terraform"
  value       = { for name, t in aiven_kafka_topic.this : name => { partitions = t.partitions, replication = t.replication } }
}
