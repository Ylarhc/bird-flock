resource "aws_dynamodb_table" "players" {
  name         = var.table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "N"
  }

  attribute {
    name = "countryCode"
    type = "S"
  }

  attribute {
    name = "recordType"
    type = "S"
  }

  attribute {
    name = "height"
    type = "N"
  }

  global_secondary_index {
    name            = "CountryIndex"
    hash_key        = "countryCode"
    range_key       = "id"
    projection_type = "INCLUDE"
    non_key_attributes = ["data"]
  }

  global_secondary_index {
    name            = "HeightIndex"
    hash_key        = "recordType"
    range_key       = "height"
    projection_type = "KEYS_ONLY"
  }
}
