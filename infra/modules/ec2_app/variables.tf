variable "name" {
  type = string
}

variable "region" {
  description = "AWS region (used for ECR login and the app's SDK config)"
  type        = string
}

variable "vpc_id" {
  type = string
}

variable "subnet_id" {
  description = "Public subnet for the instance"
  type        = string
}

variable "allowed_cidr" {
  description = "CIDR allowed to reach the API port (your IP, e.g. 1.2.3.4/32)"
  type        = string
}

variable "instance_type" {
  type    = string
  default = "t4g.small"
}

variable "architecture" {
  description = "arm64 for t4g/Graviton, x86_64 for t3"
  type        = string
  default     = "arm64"

  validation {
    condition     = contains(["arm64", "x86_64"], var.architecture)
    error_message = "architecture must be arm64 or x86_64."
  }
}

variable "app_port" {
  type    = number
  default = 3000
}

variable "ecr_repository_url" {
  type = string
}

variable "image_tag" {
  type    = string
  default = "latest"
}

variable "kafka_bootstrap_brokers" {
  type = string
}

variable "kafka_topic" {
  type = string
}

variable "kafka_replication_factor" {
  type = number
}

variable "sqs_queue_url" {
  type = string
}

variable "sqs_queue_arns" {
  description = "Queues the instance role may use"
  type        = list(string)
}

variable "compose_version" {
  description = "Docker Compose plugin release to install"
  type        = string
  default     = "v2.29.7"
}
