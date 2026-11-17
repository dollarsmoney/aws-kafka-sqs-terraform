# Amazon MSK (Managed Streaming for Apache Kafka), provisioned cluster.
#
# Learning-friendly choices:
#   - TLS encryption in transit, but no client authentication (anyone who can reach the
#     brokers on the network can connect). The security group is what protects it: only
#     the app's security group can reach port 9094. In production you'd add IAM or SASL/SCRAM auth.
#   - Brokers live in private subnets with no internet route.

resource "aws_security_group" "msk" {
  name        = "${var.name}-msk"
  description = "MSK brokers - allow TLS clients from the app"
  vpc_id      = var.vpc_id

  tags = { Name = "${var.name}-msk" }
}

resource "aws_vpc_security_group_ingress_rule" "tls_from_clients" {
  count = length(var.client_security_group_ids)

  security_group_id            = aws_security_group.msk.id
  referenced_security_group_id = var.client_security_group_ids[count.index]
  ip_protocol                  = "tcp"
  from_port                    = 9094 # TLS listener
  to_port                      = 9094
  description                  = "Kafka TLS from app"
}

resource "aws_vpc_security_group_egress_rule" "all" {
  security_group_id = aws_security_group.msk.id
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}

# Broker settings (these become server.properties on each broker).
resource "aws_msk_configuration" "this" {
  name           = "${var.name}-config"
  kafka_versions = [var.kafka_version]

  server_properties = <<-EOT
    auto.create.topics.enable=false
    default.replication.factor=${var.broker_count}
    min.insync.replicas=1
    num.partitions=3
    delete.topic.enable=true
    log.retention.hours=24
  EOT
}

resource "aws_cloudwatch_log_group" "msk" {
  name              = "/msk/${var.name}"
  retention_in_days = 3
}

resource "aws_msk_cluster" "this" {
  cluster_name           = var.name
  kafka_version          = var.kafka_version
  number_of_broker_nodes = var.broker_count # must be a multiple of the number of subnets

  broker_node_group_info {
    instance_type   = var.broker_instance_type
    client_subnets  = var.subnet_ids
    security_groups = [aws_security_group.msk.id]

    storage_info {
      ebs_storage_info {
        volume_size = var.ebs_volume_size
      }
    }
  }

  configuration_info {
    arn      = aws_msk_configuration.this.arn
    revision = aws_msk_configuration.this.latest_revision
  }

  encryption_info {
    encryption_in_transit {
      client_broker = "TLS"
      in_cluster    = true
    }
  }

  client_authentication {
    unauthenticated = true
  }

  logging_info {
    broker_logs {
      cloudwatch_logs {
        enabled   = true
        log_group = aws_cloudwatch_log_group.msk.name
      }
    }
  }

  # Creating or deleting an MSK cluster commonly takes 20-30+ minutes.
  timeouts {
    create = "60m"
    update = "120m"
    delete = "60m"
  }

  lifecycle {
    precondition {
      condition     = var.broker_count % length(var.subnet_ids) == 0
      error_message = "broker_count must be a multiple of the number of subnets."
    }
  }
}
