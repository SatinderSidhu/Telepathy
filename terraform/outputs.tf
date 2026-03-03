# Outputs - Important information after deployment

output "instance_name" {
  description = "Name of the Lightsail instance"
  value       = aws_lightsail_instance.chatcall.name
}

output "static_ip" {
  description = "Static IP address of the server"
  value       = aws_lightsail_static_ip.chatcall.ip_address
}

output "instance_username" {
  description = "SSH username"
  value       = "ubuntu"
}

output "ssh_connection_command" {
  description = "SSH command to connect to server"
  value       = "ssh -i ~/.ssh/LightsailDefaultKey-${var.aws_region}.pem ubuntu@${aws_lightsail_static_ip.chatcall.ip_address}"
}

output "instance_id" {
  description = "Instance ID"
  value       = aws_lightsail_instance.chatcall.id
}

output "instance_bundle" {
  description = "Instance bundle (size)"
  value       = var.instance_bundle_id
}

output "region" {
  description = "AWS region"
  value       = var.aws_region
}

output "next_steps" {
  description = "What to do next"
  value = <<-EOT

  ✅ Infrastructure Created Successfully!

  📝 Next Steps:

  1. SSH into server:
     ${format("ssh -i ~/.ssh/LightsailDefaultKey-%s.pem ubuntu@%s", var.aws_region, aws_lightsail_static_ip.chatcall.ip_address)}

  2. Point your domain to:
     ${aws_lightsail_static_ip.chatcall.ip_address}

  3. Access your server via:
     - IP: https://${aws_lightsail_static_ip.chatcall.ip_address}
     - Domain: https://${var.domain_name != "" ? var.domain_name : "yourdomain.com"}

  4. Follow LIGHTSAIL_QUICKSTART.md starting from Step 6 (Clone & Configure)

  💰 Estimated Cost: $${var.instance_bundle_id == "medium_2_0" ? "10" : var.instance_bundle_id == "small_2_0" ? "5" : var.instance_bundle_id == "large_2_0" ? "20" : "40"}/month

  EOT
}
