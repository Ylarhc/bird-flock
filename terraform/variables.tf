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
  default     = "nodejs20.x"
}
