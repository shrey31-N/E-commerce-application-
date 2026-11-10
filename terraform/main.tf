
data "aws_subnet" "shopsphere" {
  id = "subnet-0ce7e4a3b96ba1e4a"
}

data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"]

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"]
  }

  filter {
    name   = "architecture"
    values = ["x86_64"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

resource "aws_instance" "shopsphere" {
  ami                         = data.aws_ami.ubuntu.id
  instance_type               = var.instance_type
  subnet_id                   = data.aws_subnet.shopsphere.id
  vpc_security_group_ids      = [aws_security_group.shopsphere_sg.id]
  iam_instance_profile        = aws_iam_instance_profile.ec2_profile.name
  associate_public_ip_address = true

  root_block_device {
    volume_size = 20
    volume_type = "gp3"
    encrypted   = true
  }

  user_data = <<-EOF
    #!/bin/bash
    apt-get update -y
    snap install amazon-ssm-agent --classic || true
    snap start amazon-ssm-agent || true
  EOF

  tags = {
    Name        = "ShopSphere-Terraform-Server"
    Environment = var.environment
  }
}
