output "instance_id" {
  description = "EC2 instance ID"
  value       = aws_instance.twenty.id
}

output "instance_ip" {
  description = "Elastic IP address"
  value       = aws_eip.twenty.public_ip
}

output "domain" {
  description = "CRM domain"
  value       = var.domain
}

output "url" {
  description = "CRM URL"
  value       = "https://${var.domain}"
}

output "api_url" {
  description = "API URL for integrations (GraphQL)"
  value       = "https://${var.domain}/graphql"
}

output "ssh_command" {
  description = "SSH command to connect"
  value       = "ssh -i twenty-crm.pem ubuntu@${aws_eip.twenty.public_ip}"
}

output "ssh_private_key_file" {
  description = "Path to the generated SSH private key"
  value       = local_file.ssh_private_key.filename
}
