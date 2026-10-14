output "table_name" {
  value = aws_dynamodb_table.players.name
}

output "table_arn" {
  value = aws_dynamodb_table.players.arn
}

output "api_endpoint" {
  value = aws_apigatewayv2_stage.default.invoke_url
}
