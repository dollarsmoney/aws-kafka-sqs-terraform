terraform {
  required_version = ">= 1.6"

  required_providers {
    aiven = {
      source  = "aiven/aiven"
      version = "~> 4.0"
    }
  }
}

# Auth: export AIVEN_TOKEN=<token>  (Aiven console → User → Tokens → Generate token)
# The provider reads it from the environment, so it never goes in a file.
provider "aiven" {}
