# Variables for ChatCall Infrastructure

variable "aws_region" {
  description = "AWS region for Lightsail instance"
  type        = string
  default     = "us-east-1"
  # Other options: us-west-2, eu-west-1, ap-southeast-1, etc.
}

variable "instance_name" {
  description = "Name of the Lightsail instance"
  type        = string
  default     = "chatcall-server"
}

variable "instance_bundle_id" {
  description = "Lightsail instance bundle (size/price)"
  type        = string
  default     = "medium_2_0"
  # Options:
  # micro_2_0    = $3.50/month  (512 MB, 1 vCPU, 20 GB SSD)  - Too small for production
  # small_2_0    = $5/month     (1 GB,   1 vCPU, 40 GB SSD)  - Minimum recommended
  # medium_2_0   = $10/month    (2 GB,   1 vCPU, 60 GB SSD)  - Recommended for testing
  # large_2_0    = $20/month    (4 GB,   2 vCPU, 80 GB SSD)  - Good for production
  # xlarge_2_0   = $40/month    (8 GB,   2 vCPU, 160 GB SSD) - High traffic
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "production"
}

variable "domain_name" {
  description = "Your domain name (e.g., chatcall.yourdomain.com)"
  type        = string
  default     = ""
  # Leave empty if testing with IP only
  # Set to your domain if you have one
}

variable "enable_automatic_snapshots" {
  description = "Enable automatic daily snapshots"
  type        = bool
  default     = true
}
