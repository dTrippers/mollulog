resource "aws_acm_certificate" "this" {
  domain_name       = var.aliases[0]
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = local.tags
}

resource "aws_acm_certificate_validation" "this" {
  certificate_arn = aws_acm_certificate.this.arn
  validation_record_fqdns = [
    for option in aws_acm_certificate.this.domain_validation_options :
    option.resource_record_name
  ]
}
