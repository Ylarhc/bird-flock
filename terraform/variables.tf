variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "us-east-1"
}

variable "table_name" {
  description = "DynamoDB table name for players"
  type        = string
  default     = "Players"
}

variable "lambda_runtime" {
  description = "Lambda Node.js runtime"
  type        = string
  default     = "nodejs22.x"
}

variable "skip_aws_validation" {
  description = "Skip AWS credential/account validation calls — set true only when applying against a local emulator (e.g. the test harness), never for a real deploy"
  type        = bool
  default     = false
}
