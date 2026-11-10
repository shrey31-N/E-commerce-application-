
resource "aws_security_group" "shopsphere_sg" {
  name        = "shopsphere-terraform-sg"
  description = "Security group for ShopSphere application"
  vpc_id      = "vpc-084fd5852925f594d"

  ingress {
    description = "Public HTTP application access"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "ShopSphere-SG"
    Environment = var.environment
  }
}
