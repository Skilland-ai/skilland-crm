terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
  }

  # Uncomment to use S3 backend for shared state
  # backend "s3" {
  #   bucket = "skilland-tofu-state"
  #   key    = "twenty-crm/terraform.tfstate"
  #   region = "eu-central-1"
  # }
}

provider "aws" {
  region = var.aws_region
}
