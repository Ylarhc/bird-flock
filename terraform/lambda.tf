locals {
  routes = {
    list_players       = { method = "GET",    path = "/players",            handler = "handlers/players/list.handler" }
    get_player         = { method = "GET",    path = "/players/{id}",       handler = "handlers/players/get.handler" }
    create_player      = { method = "POST",   path = "/players",            handler = "handlers/players/create.handler" }
    update_player      = { method = "PUT",    path = "/players/{id}",       handler = "handlers/players/update.handler" }
    delete_player      = { method = "DELETE", path = "/players/{id}",       handler = "handlers/players/remove.handler" }
    kpis_all           = { method = "GET",    path = "/kpis",               handler = "handlers/kpis/all.handler" }
    kpi_best_country   = { method = "GET",    path = "/kpis/best-country",  handler = "handlers/kpis/bestCountry.handler" }
    kpi_average_bmi    = { method = "GET",    path = "/kpis/average-bmi",   handler = "handlers/kpis/averageBmi.handler" }
    kpi_median_height  = { method = "GET",    path = "/kpis/median-height", handler = "handlers/kpis/medianHeight.handler" }
  }
}

data "archive_file" "lambda_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../dist"
  output_path = "${path.module}/build/lambda.zip"
}

resource "aws_iam_role" "lambda_exec" {
  name = "tennis-api-lambda-exec"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "lambda_dynamodb" {
  name = "tennis-api-lambda-dynamodb"
  role = aws_iam_role.lambda_exec.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan",
          "dynamodb:BatchWriteItem",
        ]
        Resource = [
          aws_dynamodb_table.players.arn,
          "${aws_dynamodb_table.players.arn}/index/*",
        ]
      },
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:aws:logs:*:*:*"
      },
    ]
  })
}

resource "aws_lambda_function" "routes" {
  for_each         = local.routes
  function_name    = "tennis-api-${replace(each.key, "_", "-")}"
  role             = aws_iam_role.lambda_exec.arn
  handler          = each.value.handler
  runtime          = var.lambda_runtime
  filename         = data.archive_file.lambda_zip.output_path
  source_code_hash = data.archive_file.lambda_zip.output_base64sha256

  environment {
    variables = {
      TABLE_NAME = aws_dynamodb_table.players.name
    }
  }
}
