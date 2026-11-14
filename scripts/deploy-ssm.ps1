param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^build-[0-9]+$')]
    [string]$ImageTag
)

$Script = @'
#!/bin/bash
set -Ee

cd /opt/shopsphere

PREVIOUS_TAG=$(sed -n 's/^IMAGE_TAG=//p' image-tag.env | head -n 1)

if [ -z "$PREVIOUS_TAG" ]; then
    echo "ERROR: Previous image tag not found. Cannot deploy safely."
    exit 1
fi

echo "Previous release: $PREVIOUS_TAG"
echo "New release: __IMAGE_TAG__"


rollback() {
    EXIT_CODE=$?
    trap - ERR
    set +e

    echo "DEPLOYMENT_FAILED. Rolling back to $PREVIOUS_TAG"

    echo "IMAGE_TAG=$PREVIOUS_TAG" > image-tag.env

    docker compose --env-file image-tag.env pull
    if [ $? -ne 0 ]; then
        echo "ROLLBACK_FAILED: Could not pull previous images"
        exit 1
    fi

    docker compose --env-file image-tag.env up -d --remove-orphans
    if [ $? -ne 0 ]; then
        echo "ROLLBACK_FAILED: Could not restart previous release"
        exit 1
    fi

    sleep 20

    if ! curl -fsS http://localhost/ > /dev/null; then
        echo "ROLLBACK_FAILED: Homepage verification failed"
        exit 1
    fi

    for service in user-service product-service order-service; do
        container_id=$(docker compose --env-file image-tag.env ps -q "$service")

        if [ -z "$container_id" ]; then
            echo "ROLLBACK_FAILED: $service container missing"
            exit 1
        fi

        health=$(docker inspect --format='{{.State.Health.Status}}' "$container_id")
        echo "Rollback $service: $health"

        if [ "$health" != "healthy" ]; then
            echo "ROLLBACK_FAILED: $service is unhealthy"
            exit 1
        fi
    done

    docker compose --env-file image-tag.env ps
    echo "ROLLBACK_COMPLETED: $PREVIOUS_TAG"

    exit "$EXIT_CODE"
}


trap rollback ERR

echo "IMAGE_TAG=__IMAGE_TAG__" > image-tag.env

aws ecr get-login-password --region ap-southeast-2 | docker login --username AWS --password-stdin 507941515612.dkr.ecr.ap-southeast-2.amazonaws.com

docker compose --env-file image-tag.env pull
docker compose --env-file image-tag.env up -d --remove-orphans

sleep 20

echo "Checking homepage..."
curl -fsS http://localhost/ > /dev/null

echo "Checking backend health..."

for service in user-service product-service order-service; do
    container_id=$(docker compose --env-file image-tag.env ps -q "$service")
    if [ -z "$container_id" ]; then
        echo "ERROR: $service container not found"
        false
    fi

    health=$(docker inspect --format='{{.State.Health.Status}}' "$container_id")
    echo "$service: $health"

    if [ "$health" != "healthy" ]; then
        echo "ERROR: $service is not healthy"
        false
    fi
done

trap - ERR

docker compose --env-file image-tag.env ps
echo "DEPLOYMENT_SUCCESSFUL___IMAGE_TAG__"
'@

$RemoteScript = $Script.Replace("__IMAGE_TAG__", $ImageTag)

$Region = "ap-southeast-2"
$InstanceId = "i-0af087445cc5f5878"

if ($ImageTag -notmatch '^build-[0-9]+$') {
    throw "Invalid image tag: $ImageTag"
}

$Payload = @{
    DocumentName = "AWS-RunShellScript"
    InstanceIds = @($InstanceId)
    Parameters = @{
    commands = @($RemoteScript -split "\r?\n" | Where-Object { $_.Trim().Length -gt 0 })
    }
    Comment = "ShopSphere deployment $ImageTag with rollback"
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
