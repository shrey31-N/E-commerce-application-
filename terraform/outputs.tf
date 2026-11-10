
output "ec2_instance_id" {
  value = aws_instance.shopsphere.id
}

output "ec2_public_ip" {
  value = aws_instance.shopsphere.public_ip
}

output "ec2_public_dns" {
  value = aws_instance.shopsphere.public_dns
}

output "ecr_user_repository" {
  value = data.aws_ecr_repository.user.repository_url
}

output "ecr_product_repository" {
  value = data.aws_ecr_repository.product.repository_url
}

output "ecr_order_repository" {
  value = data.aws_ecr_repository.order.repository_url
}

output "ecr_frontend_repository" {
  value = data.aws_ecr_repository.frontend.repository_url
}
