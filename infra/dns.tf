data "aws_route53_zone" "main" {
  name = var.route53_zone_name
}

resource "aws_route53_record" "twenty" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = var.domain
  type    = "A"
  ttl     = 300
  records = [aws_eip.twenty.public_ip]
}
