
param(
    [Parameter(Mandatory=$true)]
    [string]$ImageTag
)

$ErrorActionPreference = "Stop"

$Region = "ap-southeast-2"
$InstanceId = "i-0af087445cc5f5878"

$RemoteScript = @'
#!/bin/bash
set -Eeuo pipefail

cd /opt/shopsphere

TAG_FILE="/opt/shopsphere/image-tag.env"
PREVIOUS_TAG="v1.0.0"

if [ -f "$TAG_FILE" ]; then
    PREVIOUS_TAG=$(sed -n 's/^IMAGE_TAG=//p' "$TAG_FILE" | head -n 1)
    PREVIOUS_TAG=${PREVIOUS_TAG:-v1.0.0}
fi

NEW_TAG="__IMAGE_TAG__"

rollback() {
    echo "Deployment failed. Rolling back to $PREVIOUS_TAG"
    printf 'IMAGE_TAG=%s\n' "$PREVIOUS_TAG" > "$TAG_FILE"
    aws ecr get-login-password --region ap-southeast-2 |
        docker login --username AWS --password-stdin 507941515612.dkr.ecr.ap-southeast-2.amazonaws.com
    docker compose --env-file "$TAG_FILE" pull
    docker compose --env-file "$TAG_FILE" up -d
    exit 1
}

trap rollback ERR

printf 'IMAGE_TAG=%s\n' "$NEW_TAG" > "$TAG_FILE"

aws ecr get-login-password --region ap-southeast-2 |
    docker login --username AWS --password-stdin 507941515612.dkr.ecr.ap-southeast-2.amazonaws.com

docker compose --env-file "$TAG_FILE" pull
docker compose --env-file "$TAG_FILE" up -d --remove-orphans

sleep 15

curl -fsS http://localhost/ > /dev/null
docker compose --env-file "$TAG_FILE" ps

trap - ERR
echo "Deployment successful: $NEW_TAG"
'@

$RemoteScript = $RemoteScript.Replace("__IMAGE_TAG__", $ImageTag)

$Parameters = @{
    commands = @($RemoteScript)
}

$Payload = @{
    DocumentName = "AWS-RunShellScript"
    InstanceIds = @($InstanceId)
    Parameters = $Parameters
    Comment = "ShopSphere deployment: $ImageTag"
}

$JsonPath = Join-Path $env:TEMP "shopsphere-ssm-command.json"

try {
    $JsonContent = $Payload | ConvertTo-Json -Depth 10

    $Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

    [System.IO.File]::WriteAllText(
        $JsonPath,
        $JsonContent,
        $Utf8NoBom
    )

    # Validate generated JSON before sending it to AWS
    Get-Content -Path $JsonPath -Raw | ConvertFrom-Json | Out-Null
    Write-Host "SSM JSON payload validated successfully."

    $CommandId = aws ssm send-command `
        --region $Region `
        --cli-input-json "file://$JsonPath" `
        --query "Command.CommandId" `
        --output text

    if ($LASTEXITCODE -ne 0 -or !$CommandId) {
        throw "Failed to send SSM deployment command."
    }

    Write-Host "SSM command submitted: $CommandId"

    $Status = "Pending"

    for ($i = 0; $i -lt 60; $i++) {
        Start-Sleep -Seconds 5

        $Status = aws ssm get-command-invocation `
            --region $Region `
            --command-id $CommandId `
            --instance-id $InstanceId `
            --query "Status" `
            --output text 2>$null

        if ($LASTEXITCODE -eq 0 -and $Status -in @("Success", "Failed", "TimedOut", "Cancelled")) {
            break
        }
    }

    $Details = aws ssm get-command-invocation `
        --region $Region `
        --command-id $CommandId `
        --instance-id $InstanceId `
        --output json | ConvertFrom-Json

    Write-Host $Details.StandardOutputContent

    if ($Status -ne "Success") {
        Write-Host $Details.StandardErrorContent
        throw "Deployment failed. SSM status: $Status"
    }

    Write-Host "ShopSphere deployment completed successfully."
}
finally {
    Remove-Item $JsonPath -ErrorAction SilentlyContinue
}
