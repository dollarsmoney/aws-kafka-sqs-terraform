# EC2 host running the app containers with Docker Compose. Access via SSM, no SSH.

data "aws_ssm_parameter" "al2023" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-${var.architecture}"
}

resource "aws_security_group" "app" {
  name        = "${var.name}-app"
  description = "Order pipeline app"
  vpc_id      = var.vpc_id

  tags = { Name = "${var.name}-app" }
}

resource "aws_vpc_security_group_ingress_rule" "api" {
  security_group_id = aws_security_group.app.id
  cidr_ipv4         = var.allowed_cidr
  ip_protocol       = "tcp"
  from_port         = var.app_port
  to_port           = var.app_port
  description       = "API from my IP"
}

resource "aws_vpc_security_group_egress_rule" "all" {
  security_group_id = aws_security_group.app.id
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}

data "aws_iam_policy_document" "assume_ec2" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "app" {
  name               = "${var.name}-app"
  assume_role_policy = data.aws_iam_policy_document.assume_ec2.json
}

resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.app.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy_attachment" "ecr_read" {
  role       = aws_iam_role.app.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
}

data "aws_iam_policy_document" "sqs" {
  statement {
    actions = [
      "sqs:SendMessage",
      "sqs:ReceiveMessage",
      "sqs:DeleteMessage",
      "sqs:ChangeMessageVisibility",
      "sqs:GetQueueAttributes",
      "sqs:GetQueueUrl",
    ]
    resources = var.sqs_queue_arns
  }
}

resource "aws_iam_role_policy" "sqs" {
  name   = "sqs-access"
  role   = aws_iam_role.app.id
  policy = data.aws_iam_policy_document.sqs.json
}

resource "aws_iam_instance_profile" "app" {
  name = "${var.name}-app"
  role = aws_iam_role.app.name
}

locals {
  image    = "${var.ecr_repository_url}:${var.image_tag}"
  registry = split("/", var.ecr_repository_url)[0]
}

resource "aws_instance" "app" {
  ami                    = data.aws_ssm_parameter.al2023.value
  instance_type          = var.instance_type
  subnet_id              = var.subnet_id
  vpc_security_group_ids = [aws_security_group.app.id]
  iam_instance_profile   = aws_iam_instance_profile.app.name

  user_data = templatefile("${path.module}/user_data.sh.tftpl", {
    region          = var.region
    registry        = local.registry
    image           = local.image
    app_port        = var.app_port
    kafka_brokers   = var.kafka_bootstrap_brokers
    kafka_topic     = var.kafka_topic
    kafka_rf        = var.kafka_replication_factor
    sqs_queue_url   = var.sqs_queue_url
    compose_version = var.compose_version
  })
  user_data_replace_on_change = true

  metadata_options {
    http_tokens                 = "required"
    http_put_response_hop_limit = 2 # lets containers reach IMDSv2 for role credentials
  }

  root_block_device {
    volume_type = "gp3"
    volume_size = 20
    encrypted   = true
  }

  tags = { Name = "${var.name}-app" }

  depends_on = [aws_iam_role_policy_attachment.ecr_read, aws_iam_role_policy.sqs]
}
