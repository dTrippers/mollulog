terraform {
  required_version = "~> 1.6"

  cloud {
    organization = "DimensionTrippers"

    workspaces {
      name = "mollulog"
    }
  }
}

provider "aws" {
  region = "us-east-1"

  default_tags {
    tags = local.tags
  }
}

locals {
  tags = {
    Service = "mollulog"
  }
}
