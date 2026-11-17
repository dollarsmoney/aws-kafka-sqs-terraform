output "cluster_arn" {
  value = aws_msk_cluster.this.arn
}

output "bootstrap_brokers_tls" {
  description = "Comma-separated host:9094 list that clients use to connect"
  value       = aws_msk_cluster.this.bootstrap_brokers_tls
}

output "security_group_id" {
  value = aws_security_group.msk.id
}

output "replication_factor" {
  value = var.broker_count
}
