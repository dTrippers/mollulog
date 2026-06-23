variable "origin_domain" {
  description = "Cloudflare-proxied Worker origin hostname."
  type        = string
  default     = "origin.mollulog.net"
}

variable "aliases" {
  description = "CloudFront alternate domain names. This module is intentionally scoped to the apex production domain."
  type        = list(string)
  default     = ["mollulog.net"]

  validation {
    condition     = try(length(var.aliases) == 1 && var.aliases[0] == "mollulog.net", false)
    error_message = "aliases must be exactly [\"mollulog.net\"]. This module is single-domain only."
  }
}

variable "price_class" {
  description = "CloudFront price class. PriceClass_100 is forbidden because it excludes Korea."
  type        = string
  default     = "PriceClass_200"

  validation {
    condition     = contains(["PriceClass_200", "PriceClass_All"], var.price_class)
    error_message = "price_class must include Korea: use PriceClass_200 or PriceClass_All."
  }
}

variable "enable_origin_shield" {
  description = "Enable CloudFront Origin Shield for the Worker origin."
  type        = bool
  default     = false
}

variable "origin_shield_region" {
  description = "CloudFront Origin Shield region used when enable_origin_shield is true."
  type        = string
  default     = "ap-northeast-2"
}
