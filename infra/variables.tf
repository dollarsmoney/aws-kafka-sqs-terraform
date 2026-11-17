variable "region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "project" {
  description = "Name prefix used for every resource"
  type        = string
  default     = "orders-demo"
}

variable "my_ip" {
  description = "Your public IP in CIDR form (e.g. 203.0.113.7/32). Only this IP can call the API. Find it with: curl -s https://checkip.amazonaws.com"
  type        = string

  validation {
    condition     = can(cidrhost(var.my_ip, 0))
    error_message = "my_ip must be a CIDR, e.g. 203.0.113.7/32."
  }
}

variable "kafka_version" {
  description = "MSK Kafka version (3.9.x is AWS's recommended version; 3.6.0/3.7.x are past end of support)"
  type        = string
  default     = "3.9.x"
}

variable "broker_instance_type" {
  type    = string
  default = "kafka.t3.small"
}

variable "app_instance_type" {
  type    = string
  default = "t4g.small"
}

variable "image_tag" {
  description = "App image tag the EC2 instance runs"
  type        = string
  default     = "latest"
}

variable "orders_topic" {
  description = "Kafka topic for order events"
  type        = string
  default     = "orders.created"
}
