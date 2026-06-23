output "distribution_domain_name" {
  description = "CloudFront distribution domain name to use for DNS cutover."
  value       = aws_cloudfront_distribution.this.domain_name
}

output "distribution_id" {
  description = "CloudFront distribution ID."
  value       = aws_cloudfront_distribution.this.id
}

output "acm_validation_records" {
  description = "DNS validation records to create in Cloudflare as DNS-only CNAME records."
  value = {
    for option in aws_acm_certificate.this.domain_validation_options :
    option.domain_name => {
      name  = option.resource_record_name
      type  = option.resource_record_type
      value = option.resource_record_value
    }
  }
}

output "cert_arn" {
  description = "ACM certificate ARN used by the CloudFront distribution."
  value       = aws_acm_certificate.this.arn
}
