# ChatCall - AWS Lightsail Infrastructure
# Deploy with: terraform apply

terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

# Lightsail Instance
resource "aws_lightsail_instance" "chatcall" {
  name              = var.instance_name
  availability_zone = "${var.aws_region}a"
  blueprint_id      = "ubuntu_22_04"
  bundle_id         = var.instance_bundle_id

  user_data = templatefile("${path.module}/user_data.sh", {
    domain_name = var.domain_name
  })

  tags = {
    Name        = "ChatCall Server"
    Environment = var.environment
    Project     = "ChatCall"
  }
}

# Static IP
resource "aws_lightsail_static_ip" "chatcall" {
  name = "${var.instance_name}-static-ip"
}

# Attach Static IP to Instance
resource "aws_lightsail_static_ip_attachment" "chatcall" {
  static_ip_name = aws_lightsail_static_ip.chatcall.name
  instance_name  = aws_lightsail_instance.chatcall.name
}

# Firewall Rules
resource "aws_lightsail_instance_public_ports" "chatcall" {
  instance_name = aws_lightsail_instance.chatcall.name

  # HTTPS
  port_info {
    protocol  = "tcp"
    from_port = 443
    to_port   = 443
    cidrs     = ["0.0.0.0/0"]
  }

  # HTTP (redirect to HTTPS)
  port_info {
    protocol  = "tcp"
    from_port = 80
    to_port   = 80
    cidrs     = ["0.0.0.0/0"]
  }

  # SSH
  port_info {
    protocol  = "tcp"
    from_port = 22
    to_port   = 22
    cidrs     = ["0.0.0.0/0"]
  }

  # TURN TCP
  port_info {
    protocol  = "tcp"
    from_port = 3478
    to_port   = 3478
    cidrs     = ["0.0.0.0/0"]
  }

  # TURN UDP
  port_info {
    protocol  = "udp"
    from_port = 3478
    to_port   = 3478
    cidrs     = ["0.0.0.0/0"]
  }

  # mediasoup WebRTC
  port_info {
    protocol  = "udp"
    from_port = 40000
    to_port   = 40100
    cidrs     = ["0.0.0.0/0"]
  }

  # TURN relay ports
  port_info {
    protocol  = "udp"
    from_port = 49152
    to_port   = 65535
    cidrs     = ["0.0.0.0/0"]
  }
}

# SSH Key Pair (optional - Lightsail creates default key)
# Uncomment if you want to use your own SSH key
# resource "aws_lightsail_key_pair" "chatcall" {
#   name       = "${var.instance_name}-keypair"
#   public_key = file("~/.ssh/id_rsa.pub")
# }
