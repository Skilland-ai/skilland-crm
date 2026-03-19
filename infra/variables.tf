variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "eu-central-1"
}

variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t3.medium"
}

variable "domain" {
  description = "Domain name for the CRM"
  type        = string
  default     = "crm.skilland.ai"
}

variable "route53_zone_name" {
  description = "Route 53 hosted zone name"
  type        = string
  default     = "skilland.ai"
}

variable "allowed_ssh_cidrs" {
  description = "CIDR blocks allowed for SSH access"
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "root_volume_size" {
  description = "Root EBS volume size in GB"
  type        = number
  default     = 30
}
