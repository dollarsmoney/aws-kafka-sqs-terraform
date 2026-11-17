variable "aiven_project" {
  description = "Aiven project name (top-left project picker in the Aiven console)"
  type        = string
}

variable "kafka_service_name" {
  description = "Aiven Kafka service name (shown on the service page, e.g. kafka-1a2b3c4d)"
  type        = string
}
