locals {
  worker_origin_id = "mollulog-worker-origin"
}

data "aws_cloudfront_cache_policy" "caching_optimized" {
  name = "Managed-CachingOptimized"
}

data "aws_cloudfront_cache_policy" "caching_disabled" {
  name = "Managed-CachingDisabled"
}

data "aws_cloudfront_origin_request_policy" "all_viewer" {
  name = "Managed-AllViewer"
}

resource "aws_cloudfront_distribution" "this" {
  comment         = "MolluLog CDN"
  enabled         = true
  is_ipv6_enabled = true
  aliases         = var.aliases
  http_version    = "http2and3"
  price_class     = var.price_class

  origin {
    domain_name = var.origin_domain
    origin_id   = local.worker_origin_id

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_ssl_protocols   = ["TLSv1.2"]
      origin_protocol_policy = "https-only"
    }

    dynamic "origin_shield" {
      for_each = var.enable_origin_shield ? [true] : []

      content {
        enabled              = true
        origin_shield_region = var.origin_shield_region
      }
    }
  }

  ordered_cache_behavior {
    path_pattern     = "/assets/*"
    cache_policy_id  = data.aws_cloudfront_cache_policy.caching_optimized.id
    target_origin_id = local.worker_origin_id
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]

    viewer_protocol_policy = "redirect-to-https"
    compress               = true
  }

  ordered_cache_behavior {
    path_pattern     = "/icons/*"
    cache_policy_id  = data.aws_cloudfront_cache_policy.caching_optimized.id
    target_origin_id = local.worker_origin_id
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]

    viewer_protocol_policy = "redirect-to-https"
    compress               = true
  }

  ordered_cache_behavior {
    path_pattern     = "*.png"
    cache_policy_id  = data.aws_cloudfront_cache_policy.caching_optimized.id
    target_origin_id = local.worker_origin_id
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]

    viewer_protocol_policy = "redirect-to-https"
    compress               = true
  }

  ordered_cache_behavior {
    path_pattern     = "*.ico"
    cache_policy_id  = data.aws_cloudfront_cache_policy.caching_optimized.id
    target_origin_id = local.worker_origin_id
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]

    viewer_protocol_policy = "redirect-to-https"
    compress               = true
  }

  ordered_cache_behavior {
    path_pattern     = "*.txt"
    cache_policy_id  = data.aws_cloudfront_cache_policy.caching_optimized.id
    target_origin_id = local.worker_origin_id
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]

    viewer_protocol_policy = "redirect-to-https"
    compress               = true
  }

  ordered_cache_behavior {
    path_pattern     = "*.webmanifest"
    cache_policy_id  = data.aws_cloudfront_cache_policy.caching_optimized.id
    target_origin_id = local.worker_origin_id
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]

    viewer_protocol_policy = "redirect-to-https"
    compress               = true
  }

  default_cache_behavior {
    cache_policy_id          = data.aws_cloudfront_cache_policy.caching_disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer.id
    target_origin_id         = local.worker_origin_id
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods           = ["GET", "HEAD"]

    viewer_protocol_policy = "redirect-to-https"
    compress               = true
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.this.certificate_arn
    minimum_protocol_version = "TLSv1.2_2021"
    ssl_support_method       = "sni-only"
  }

  tags = local.tags
}
