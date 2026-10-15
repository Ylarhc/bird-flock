# Deploy IAM user

A dedicated IAM user scoped to exactly what this Terraform config needs,
so you don't have to deploy with a full-access role/account.

## 1. Generate the policy from the actual Terraform plan

Don't hand-write the policy — generate it from the plan so it matches what
Terraform will really call. Requires `uv` (https://docs.astral.sh/uv/getting-started/installation/).

```bash
cd terraform
terraform plan -out=plan.tfplan
terraform show -json plan.tfplan > plan.json

uvx iam-policy-autopilot@latest generate-policies plan.json \
  --region us-east-1 \
  --account <ACCOUNT_ID> \
  --pretty

rm -f plan.tfplan plan.json   # may contain secrets — delete once done
```

Autopilot misses one thing on a first-ever apply: it won't add `iam:CreateRole` /
`iam:DeleteRole` for a new `aws_iam_role` resource (it only generates actions for
roles it assumes already exist). Add those two actions by hand, scoped to the
specific role ARN (`tennis-api-lambda-exec` here) — nothing else needs it.

The resulting policy, saved as `deploy-policy.json`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["apigateway:DELETE", "apigateway:GET", "apigateway:PATCH", "apigateway:POST", "apigateway:PUT"],
      "Resource": ["*"]
    },
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:AssociateTableReplica", "dynamodb:BatchWriteItem", "dynamodb:CreateGlobalTableWitness",
        "dynamodb:CreateTable", "dynamodb:CreateTableReplica", "dynamodb:DeleteGlobalTableWitness",
        "dynamodb:DeleteItem", "dynamodb:DescribeContinuousBackups", "dynamodb:DescribeImport",
        "dynamodb:DescribeTable", "dynamodb:DescribeTimeToLive", "dynamodb:GetItem", "dynamodb:ImportTable",
        "dynamodb:ListTagsOfResource", "dynamodb:PutItem", "dynamodb:PutResourcePolicy", "dynamodb:Query",
        "dynamodb:ReadDataForReplication", "dynamodb:ReplicateSettings", "dynamodb:RestoreTableFromBackup",
        "dynamodb:Scan", "dynamodb:TagResource", "dynamodb:UntagResource", "dynamodb:UpdateContinuousBackups",
        "dynamodb:UpdateItem", "dynamodb:UpdateTable", "dynamodb:UpdateTimeToLive", "dynamodb:WriteDataForReplication"
      ],
      "Resource": [
        "arn:aws:dynamodb:us-east-1:<ACCOUNT_ID>:table/Players",
        "arn:aws:dynamodb:us-east-1:<ACCOUNT_ID>:table/Players/backup/*",
        "arn:aws:dynamodb:us-east-1:<ACCOUNT_ID>:table/Players/import/*",
        "arn:aws:dynamodb:us-east-1:<ACCOUNT_ID>:table/Players/index/*",
        "arn:aws:dynamodb:us-east-1:<ACCOUNT_ID>:table/Players/stream/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "iam:GetRole", "iam:GetRolePolicy", "iam:ListAttachedRolePolicies", "iam:ListInstanceProfileTags",
        "iam:ListMFADeviceTags", "iam:ListOpenIDConnectProviderTags", "iam:ListPolicyTags", "iam:ListRolePolicies",
        "iam:ListRoleTags", "iam:ListSAMLProviderTags", "iam:ListServerCertificateTags", "iam:ListUserTags",
        "iam:PutRolePolicy"
      ],
      "Resource": [
        "arn:aws:iam::<ACCOUNT_ID>:instance-profile/*", "arn:aws:iam::<ACCOUNT_ID>:mfa/*",
        "arn:aws:iam::<ACCOUNT_ID>:oidc-provider/*", "arn:aws:iam::<ACCOUNT_ID>:policy/*",
        "arn:aws:iam::<ACCOUNT_ID>:role/tennis-api-lambda-exec", "arn:aws:iam::<ACCOUNT_ID>:saml-provider/*",
        "arn:aws:iam::<ACCOUNT_ID>:server-certificate/*", "arn:aws:iam::<ACCOUNT_ID>:user/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": ["iam:CreateRole", "iam:DeleteRole"],
      "Resource": ["arn:aws:iam::<ACCOUNT_ID>:role/tennis-api-lambda-exec"]
    },
    {
      "Effect": "Allow",
      "Action": ["iam:PassRole"],
      "Resource": ["*"],
      "Condition": { "StringEquals": { "iam:PassedToService": ["apigateway.amazonaws.com"] } }
    },
    {
      "Effect": "Allow",
      "Action": ["iam:PassRole"],
      "Resource": ["*"],
      "Condition": { "StringEquals": { "iam:PassedToService": ["lambda.amazonaws.com"] } }
    },
    {
      "Effect": "Allow",
      "Action": ["kms:CreateGrant", "kms:DescribeKey"],
      "Resource": ["arn:aws:kms:us-east-1:<ACCOUNT_ID>:key/*"],
      "Condition": { "StringEquals": { "kms:ViaService": ["dynamodb.us-east-1.amazonaws.com"] } }
    },
    {
      "Effect": "Allow",
      "Action": [
        "lambda:AddPermission", "lambda:CreateFunction", "lambda:DeleteFunctionCodeSigningConfig",
        "lambda:DeleteFunctionConcurrency", "lambda:GetFunction", "lambda:GetFunctionCodeSigningConfig",
        "lambda:GetFunctionConcurrency", "lambda:GetFunctionConfiguration", "lambda:GetLayerVersion",
        "lambda:GetPolicy", "lambda:ListVersionsByFunction", "lambda:PassCapacityProvider",
        "lambda:PublishVersion", "lambda:PutFunctionCodeSigningConfig", "lambda:PutFunctionConcurrency",
        "lambda:UpdateFunctionCode", "lambda:UpdateFunctionConfiguration"
      ],
      "Resource": [
        "arn:aws:lambda:us-east-1:<ACCOUNT_ID>:capacity-provider:*",
        "arn:aws:lambda:us-east-1:<ACCOUNT_ID>:function:tennis-api-create-player",
        "arn:aws:lambda:us-east-1:<ACCOUNT_ID>:function:tennis-api-delete-player",
        "arn:aws:lambda:us-east-1:<ACCOUNT_ID>:function:tennis-api-get-player",
        "arn:aws:lambda:us-east-1:<ACCOUNT_ID>:function:tennis-api-kpi-average-bmi",
        "arn:aws:lambda:us-east-1:<ACCOUNT_ID>:function:tennis-api-kpi-best-country",
        "arn:aws:lambda:us-east-1:<ACCOUNT_ID>:function:tennis-api-kpi-median-height",
        "arn:aws:lambda:us-east-1:<ACCOUNT_ID>:function:tennis-api-kpis-all",
        "arn:aws:lambda:us-east-1:<ACCOUNT_ID>:function:tennis-api-list-players",
        "arn:aws:lambda:us-east-1:<ACCOUNT_ID>:function:tennis-api-reset",
        "arn:aws:lambda:us-east-1:<ACCOUNT_ID>:function:tennis-api-update-player",
        "arn:aws:lambda:us-east-1:<ACCOUNT_ID>:layer:*:*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": ["lambda:ListTags", "lambda:TagResource", "lambda:UntagResource"],
      "Resource": ["*"]
    }
  ]
}
```

## 2. Create the user, policy, and access key

```bash
aws iam create-user --user-name tennis-api-deployer

# IAM inline user policies cap at 2048 bytes — this policy is bigger,
# so create it as a standalone managed policy instead.
aws iam create-policy \
  --policy-name tennis-api-deploy \
  --policy-document file://deploy-policy.json \
  --description "Scoped deploy permissions for tennis-api-aws-migration Terraform apply"

aws iam attach-user-policy \
  --user-name tennis-api-deployer \
  --policy-arn arn:aws:iam::<ACCOUNT_ID>:policy/tennis-api-deploy

aws iam create-access-key --user-name tennis-api-deployer
# -> save the returned AccessKeyId / SecretAccessKey now; the secret is shown only once
```

## 3. Configure a local profile and deploy with it

Add to `~/.aws/credentials`:

```ini
[tennis-api-deployer]
aws_access_key_id = <ACCESS_KEY_ID>
aws_secret_access_key = <SECRET_ACCESS_KEY>
```

Add to `~/.aws/config`:

```ini
[profile tennis-api-deployer]
region = us-east-1
```

Then deploy with:

```bash
AWS_PROFILE=tennis-api-deployer terraform plan
AWS_PROFILE=tennis-api-deployer terraform apply
```

### Optional: skip setting `AWS_PROFILE` every time

Terraform merges any `override.tf` in this directory into the config,
overriding matching blocks — a good place for machine-local settings that
shouldn't be committed. Create `terraform/override.tf` (already gitignored):

```hcl
provider "aws" {
  profile = "tennis-api-deployer"
}
```

With that in place, plain `terraform plan` / `terraform apply` use the
`tennis-api-deployer` profile automatically, no `AWS_PROFILE` needed.

## Notes

- This policy covers only the resources in today's plan. Adding new Terraform
  resources later will likely need the policy extended — regenerate via step 1
  against the new plan, then merge the new resource ARNs/actions into the
  existing statements (a `terraform plan` diff only lists *changed* resources,
  so Autopilot's output on a later run is a partial patch, not a full
  replacement). Publish the merged document as a new managed-policy version:
  `aws iam create-policy-version --policy-arn <policy-arn> --policy-document file://deploy-policy.json --set-as-default`
  (IAM keeps at most 5 versions — delete the oldest with
  `aws iam delete-policy-version` if you hit that limit).
- `apigateway:*` and the `lambda:*Tags` actions use `Resource: "*"` — Autopilot
  couldn't derive narrower ARNs for those API calls. Fine for a single API;
  revisit if this user is ever reused across multiple APIs.
- The access key is long-lived (unlike `aws login` sessions) — store it securely
  and rotate it periodically.
