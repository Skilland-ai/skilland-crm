data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

resource "tls_private_key" "ssh" {
  algorithm = "ED25519"
}

resource "aws_key_pair" "twenty" {
  key_name   = "twenty-crm"
  public_key = tls_private_key.ssh.public_key_openssh
}

resource "local_file" "ssh_private_key" {
  content         = tls_private_key.ssh.private_key_openssh
  filename        = "${path.module}/twenty-crm.pem"
  file_permission = "0600"
}

resource "aws_instance" "twenty" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  key_name               = aws_key_pair.twenty.key_name
  vpc_security_group_ids = [aws_security_group.twenty.id]
  user_data              = file("${path.module}/user-data.sh")

  root_block_device {
    volume_size = var.root_volume_size
    volume_type = "gp3"
    encrypted   = true
  }

  tags = {
    Name = "twenty-crm"
  }
}

resource "aws_eip" "twenty" {
  instance = aws_instance.twenty.id

  tags = {
    Name = "twenty-crm"
  }
}
