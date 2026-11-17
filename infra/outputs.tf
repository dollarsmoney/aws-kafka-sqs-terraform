output "region" {
  value = var.region
}

output "api_url" {
  value = "http://${module.ec2_app.public_ip}:3000"
}

output "instance_id" {
  value = module.ec2_app.instance_id
}

output "ecr_repository_url" {
  value = module.ecr.repository_url
}

output "kafka_bootstrap_brokers" {
  value = module.msk.bootstrap_brokers_tls
}

output "sqs_queue_url" {
  value = module.sqs.queue_url
}

output "sqs_dlq_url" {
  value = module.sqs.dlq_url
}
