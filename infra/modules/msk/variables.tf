variable "name" {
  description = "Cluster name"
  type        = string
}

variable "vpc_id" {
  type = string
}

variable "subnet_ids" {
  description = "Subnets for the brokers, one per AZ (at least 2)"
  type        = list(string)
}

variable "client_security_group_ids" {
  description = "Security groups that may connect to the brokers on 9094"
  type        = list(string)
}

variable "kafka_version" {
  type    = string
  default = "3.9.x"
}

variable "broker_instance_type" {
  type    = string
  default = "kafka.t3.small"
}

variable "broker_count" {
  type    = number
  default = 2
}

variable "ebs_volume_size" {
  description = "Storage per broker in GiB"
  type        = number
  default     = 10
}
