
param(
    [Parameter(Mandatory = $true)]
    [string]$ImageTag
)

$ErrorActionPreference = "Stop"

if ($ImageTag -notmatch '^build-[0-9]+$') {
    throw "Invalid image tag: $ImageTag"
}

$Region = "ap-southeast-2"
$InstanceId = "i-0af087445cc5f5878"
$Registry = "507941515612.dkr.ecr.ap-southeast-2.amazonaws.com"

$Commands = @(
    "set -e"
    "cd /opt/shopsphere"
    "PREVIOUS_TAG=`$(sed -n 's/^IMAGE_TAG=//p' image-tag.env | head -n 1)"
    "echo Previous release: `$PREVIOUS_TAG"
    "echo IMAGE_TAG=$ImageTag > image-tag.env"
    "aws ecr get-login-password --region $Region | docker login --username AWS --password-stdin $Registry"
    "docker compose --env-file image-tag.env pull"
    "docker compose --env-file image-tag.env up -d --remove-orphans"
    "sleep 15"
    "curl -fsS http://localhost/ > /dev/null"
    "docker compose --env-file image-tag.env ps"
    "echo DEPLOYMENT_SUCCESSFUL_$ImageTag"
)

$Payload = @{
    DocumentName = "AWS-RunShellScript"
    InstanceIds = @($InstanceId)
    Parameters = @{
        commands = $Commands
    }
    Comment = "ShopSphere deployment $ImageTag"
}

$JsonPath = Join-Path $env:TEMP "shopsphere-deploy.json"

try {
    $Json = $Payload | ConvertTo-Json -Depth 10
    [System.IO.File]::WriteAllText(
        $JsonPath,
        $Json,
        (New-Object System.Text.UTF8Encoding($false))
    )

    $CommandId = aws ssm send-command `
        --cli-input-json "file://$JsonPath" `
        --region $Region `
        --query "Command.CommandId" `
        --output text

    if ($LASTEXITCODE -ne 0 -or !$CommandId) {
        throw "Unable to submit SSM deployment command."
    }

    Write-Host "Deployment command submitted: $CommandId"

    $Status = "Pending"

    for ($i = 0; $i -lt 60; $i++) {
        Start-Sleep -Seconds 5

        $Status = aws ssm get-command-invocation `
            --command-id $CommandId `
            --instance-id $InstanceId `
            --region $Region `
            --query "Status" `
            --output text 2>$null

        if ($LASTEXITCODE -eq 0 -and
            $Status -in @("Success", "Failed", "TimedOut", "Cancelled")) {
            break
        }
    }

    $Result = aws ssm get-command-invocation `
        --command-id $CommandId `
        --instance-id $InstanceId `
        --region $Region `
        --output json | ConvertFrom-Json

    Write-Host $Result.StandardOutputContent

    if ($Status -ne "Success") {
        Write-Host $Result.StandardErrorContent
        throw "EC2 deployment failed. SSM status: $Status"
    }

    Write-Host "ShopSphere deployment succeeded: $ImageTag"
}
finally {
    Remove-Item $JsonPath -ErrorAction SilentlyContinue
}
