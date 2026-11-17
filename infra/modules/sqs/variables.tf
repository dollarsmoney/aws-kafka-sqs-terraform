variable "name" {
  description = "Name of the main queue (the DLQ is named <name>-dlq)"
  type        = string
}

variable "visibility_timeout_seconds" {
  description = "How long a received message stays hidden before it can be retried. Should be longer than your processing time."
  type        = number
  default     = 10
}

variable "max_receive_count" {
  description = "How many times a message can be received before it goes to the DLQ"
  type        = number
  default     = 3
}
