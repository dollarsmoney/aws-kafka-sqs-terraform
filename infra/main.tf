module "network" {
  source = "./modules/network"
  name   = var.project
}

module "sqs" {
  source = "./modules/sqs"
  name   = "${var.project}-order-jobs"
}

module "ecr" {
  source = "./modules/ecr"
  name   = var.project
}

module "msk" {
  source = "./modules/msk"

  name                      = var.project
  vpc_id                    = module.network.vpc_id
  subnet_ids                = module.network.private_subnet_ids
  client_security_group_ids = [module.ec2_app.security_group_id]
  kafka_version             = var.kafka_version
  broker_instance_type      = var.broker_instance_type
}

module "ec2_app" {
  source = "./modules/ec2_app"

  name          = var.project
  region        = var.region
  vpc_id        = module.network.vpc_id
  subnet_id     = module.network.public_subnet_ids[0]
  allowed_cidr  = var.my_ip
  instance_type = var.app_instance_type

  ecr_repository_url = module.ecr.repository_url
  image_tag          = var.image_tag

  kafka_bootstrap_brokers  = module.msk.bootstrap_brokers_tls
  kafka_topic              = var.orders_topic
  kafka_replication_factor = module.msk.replication_factor

  sqs_queue_url  = module.sqs.queue_url
  sqs_queue_arns = [module.sqs.queue_arn, module.sqs.dlq_arn]
}
