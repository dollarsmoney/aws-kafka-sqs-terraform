terraform {
  required_version = ">= 1.6"

  required_providers {
    aiven = {
      source  = "aiven/aiven"
      version = "~> 4.0"
    }
  }
}

# Auth via the AIVEN_TOKEN environment variable.
provider "aiven" {}
