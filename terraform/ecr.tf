
data "aws_ecr_repository" "user" {
  name = "shopsphere-user"
}

data "aws_ecr_repository" "product" {
  name = "shopsphere-product"
}

data "aws_ecr_repository" "order" {
  name = "shopsphere-order"
}

data "aws_ecr_repository" "frontend" {
  name = "shopsphere-frontend"
}
