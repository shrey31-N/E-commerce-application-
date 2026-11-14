# ShopSphere
Infrastructure Diagram 

<img width="2002" height="1162" alt="Untitled Diagram drawio (1)" src="https://github.com/user-attachments/assets/1f4a16f0-20a3-46f5-9ad4-2ce6a00d51fb" />



Microservices e-commerce demo built as the application for the AWS DevOps assignment
(GitHub → Jenkins → Docker → ECR → EC2, monitored with Prometheus + Grafana).

Customers can register, log in, browse products, view details, place orders and see their order history.

## Architecture

```
Customer ──HTTP :80──▶ Nginx gateway ──▶ React frontend
                          │ /api/users/*    ──▶ user-service    :3001  (register, login, JWT)
                          │ /api/products*  ──▶ product-service :3002  (list, details)
                          └ /api/orders*    ──▶ order-service   :3003  (place order, history)

order-service ──▶ product-service   (looks up prices server-side; never trusts the client)

Prometheus :9090 scrapes /metrics on the 3 services + node-exporter ──▶ Grafana :3000
```

| Service | Port | Endpoints |
|---|---|---|
| user-service | 3001 | `POST /api/users/register`, `POST /api/users/login`, `GET /api/users/me` |
| product-service | 3002 | `GET /api/products?category=&q=`, `GET /api/products/:id` |
| order-service | 3003 | `POST /api/orders`, `GET /api/orders`, `GET /api/orders/:id` (JWT required) |

Every service also exposes `GET /health` and `GET /metrics` (Prometheus).
Through Nginx the health checks are at `/health/user`, `/health/product`, `/health/order`.

Design notes:
- Auth is a JWT signed with a shared `JWT_SECRET`; order-service verifies it without calling user-service.
- Data is stored as JSON files on Docker volumes (`user_data`, `order_data`). This keeps the footprint small
  (no RDS needed, per the assignment) while still demonstrating persistent volumes.
- The Nginx gateway resolves upstreams at request time, so it stays up and returns a JSON `502`
  if a service is stopped - useful for the failure-simulation task.

## Run locally with Docker Compose

```bash
cp .env.example .env          # then edit JWT_SECRET and GRAFANA_ADMIN_PASSWORD
docker compose up -d --build
docker compose ps             # wait until all containers are "healthy"
```

- Shop: http://localhost
- Health: http://localhost/health/user, `/health/product`, `/health/order`
- Prometheus: http://localhost:9090 and Grafana: http://localhost:3000 (user `admin`, password from `.env`).
  Both are bound to localhost only; on EC2 reach them with an SSH tunnel:
  `ssh -L 3000:localhost:3000 -L 9090:localhost:9090 ubuntu@<ec2-ip>`

Stop everything: `docker compose down` (add `-v` to also delete volumes).

## Run without Docker (development)

```bash
export JWT_SECRET=dev-secret
cd services/user-service    && npm install && PORT=3001 npm start &
cd services/product-service && npm install && PORT=3002 npm start &
cd services/order-service   && npm install && PORT=3003 PRODUCT_SERVICE_URL=http://localhost:3002 npm start &
cd frontend && npm install && npm run dev      # http://localhost:5173 (proxies /api/* to the services)
```

## Tests

Each service has unit tests (Node's built-in test runner - no extra dependencies). Jenkins can run these as the
"application tests" pipeline stage:

```bash
cd services/user-service && npm ci && npm test
```

## Image naming (for ECR)

| Service | ECR repository | Image |
|---|---|---|
| user-service | `shopsphere-user` | `$REGISTRY/shopsphere-user:$TAG` |
| product-service | `shopsphere-product` | `$REGISTRY/shopsphere-product:$TAG` |
| order-service | `shopsphere-order` | `$REGISTRY/shopsphere-order:$TAG` |

`REGISTRY` and `TAG` are read by `docker-compose.yml`. The frontend is built on the host (the diagram uses three repos).
Tag with the git short SHA or build number (e.g. `TAG=1.0.${BUILD_NUMBER}`), not just `latest`, so rollback is
a matter of redeploying a previous tag.

## Troubleshooting drills

```bash
docker compose logs -f order-service
docker compose stop product-service      # order placement now returns 503; /health/product returns 502
docker compose start product-service    # service recovers
docker kill shopsphere-user-service-1    # restart policy brings it back
```
Watch the "Service availability" panel and the `ServiceDown` alert react in Grafana/Prometheus.

## DevOps Implementation

The ShopSphere application is deployed using an automated DevOps workflow involving Jenkins, Docker, Amazon ECR, AWS EC2, Terraform and monitoring tools.

The objective is to automate application build, testing, container image creation, image publishing and deployment to AWS.

### 1. CI/CD Pipeline – Jenkins

Jenkins is used to automate the CI/CD process.

**Pipeline stages:**

1. **Source Checkout** – Retrieves application source code from GitHub.
2. **Set Release Version** – Generates a unique Docker image tag using the Jenkins build number (`build-${BUILD_NUMBER}`).
3. **Prepare Environment** – Prepares the required application environment configuration.
4. **Configuration Validation** – Validates the Docker Compose configuration.
5. **Application Tests** – Executes available application tests.
6. **Build Docker Images** – Builds Docker images for all application services.
7. **Verify Docker Images** – Checks that the expected images have been created.
8. **Authenticate with Amazon ECR** – Authenticates Jenkins with AWS ECR.
9. **Push Images to ECR** – Publishes the versioned images to Amazon ECR.
10. **Deploy to EC2** – Uses AWS Systems Manager (SSM) to deploy the new release to the EC2 instance.

### 2. Docker Image Management – Amazon ECR

Amazon Elastic Container Registry (ECR) is used to store application Docker images.

The following repositories are used:

| ECR Repository | Application Component |
|---|---|
| `shopsphere-user` | User Service |
| `shopsphere-product` | Product Service |
| `shopsphere-order` | Order Service |
| `shopsphere-frontend` | React Frontend |

Images are tagged using Jenkins build numbers to maintain release versions and support rollback.

### 3. Infrastructure as Code – Terraform

Terraform is used to provision and manage the AWS infrastructure.

**Terraform-managed resources include:**

- EC2 instance
- EC2 security group
- IAM role and instance profile
- IAM permissions required by the EC2 instance

Existing ECR repositories are referenced by the Terraform configuration.

**Terraform workflow:**

```bash
terraform init
terraform validate
terraform plan -out=tfplan
terraform apply tfplan
terraform output
```

Terraform configuration files are maintained in the `terraform/` directory.

### 4. AWS EC2 Deployment

The application is deployed on an Ubuntu 24.04 EC2 instance in the AWS Sydney region (`ap-southeast-2`).

**Deployment environment:**

- Operating System: Ubuntu 24.04
- Instance Type: t3.small
- Container Runtime: Docker Engine
- Container Orchestration: Docker Compose
- Reverse Proxy: Nginx
- Deployment Directory: `/opt/shopsphere`

Docker Compose manages the following five containers:

- Frontend
- User Service
- Product Service
- Order Service
- Nginx Reverse Proxy

Nginx routes incoming HTTP requests to the frontend and appropriate backend services.

### 5. Automated Deployment Using AWS Systems Manager

AWS Systems Manager (SSM) is used to execute deployment commands remotely on the EC2 instance.

The Jenkins pipeline invokes the PowerShell deployment script:

```text
scripts/deploy-ssm.ps1
```

The deployment process:

1. Validates the requested image tag.
2. Reads the previous deployment version.
3. Updates the release tag.
4. Authenticates with Amazon ECR.
5. Pulls the required Docker images.
6. Updates the application using Docker Compose.
7. Verifies the application and backend health.
8. Reports deployment success or initiates rollback.

SSM allows remote deployment without requiring public SSH access to the EC2 instance.

### 6. Deployment Rollback

A rollback mechanism is implemented in the deployment script.

If a new deployment fails, the script attempts to restore the previous working image tag and restart the application.

**Rollback test performed:**

- Previous working version: `build-24`
- Test deployment version: `build-9999999`
- Failure reason: Requested image was unavailable in Amazon ECR.
- Recovery: Previous release was restored.
- Verification: Backend health checks passed and the application returned HTTP 200.

This demonstrates recovery from the tested image-pull failure scenario.

### 7. Monitoring and Observability

Monitoring is implemented using Prometheus, Grafana, Node Exporter and Blackbox Exporter.

The monitoring tools run on the Windows workstation, while Node Exporter runs on the Ubuntu EC2 instance.

| Tool | Purpose |
|---|---|
| Node Exporter | Collects Linux host metrics |
| Prometheus | Scrapes and stores metrics |
| Grafana | Displays dashboards and evaluates alert rules |
| Blackbox Exporter | Checks public website availability |

**Monitoring metrics include:**

- CPU utilization
- Memory usage
- Disk utilization
- Network traffic
- System uptime
- EC2 Node Exporter availability
- Website HTTP availability
- HTTP response status and probe duration

### 8. Monitoring Connectivity

AWS Systems Manager port forwarding is used to securely connect Prometheus on Windows to Node Exporter on EC2.

The Node Exporter endpoint is accessed locally through:

```text
http://127.0.0.1:9100/metrics
```

Prometheus runs on:

```text
http://localhost:9091
```

Grafana runs on:

```text
http://localhost:3000
```

Blackbox Exporter runs on:

```text
http://localhost:9115
```

The Node Exporter port is not exposed publicly through the EC2 security group.

### 9. Application and Infrastructure Ports

| Port | Component | Description |
|---|---|---|
| 80 | Nginx | Public application HTTP access |
| 3001 | User Service | Internal user API |
| 3002 | Product Service | Internal product API |
| 3003 | Order Service | Internal order API |
| 8080 | Jenkins | CI/CD server |
| 9091 | Prometheus | Metrics collection and query interface |
| 9100 | Node Exporter | EC2 host metrics |
| 9115 | Blackbox Exporter | Website availability probes |
| 3000 | Grafana | Monitoring dashboard |

The backend and Node Exporter ports are not intended for direct public access.

### 10. Security Practices

The project follows several important security practices:

- EC2 uses an IAM instance role for ECR image pulls and SSM access.
- Jenkins AWS credentials are stored in Jenkins Credentials.
- Application secrets are maintained in `.env` and excluded from Git.
- `.env.example` is provided as an environment configuration template.
- SSH access is not required for normal server administration.
- Monitoring endpoints are accessed locally or through SSM port forwarding.
- Terraform state files and sensitive configuration files must not be committed to Git.

### 11. Current Implementation Status

| Component | Status |
|---|---|
| ShopSphere microservices application | Completed |
| Dockerfiles and Docker Compose | Completed |
| Nginx reverse proxy | Completed |
| AWS EC2 deployment | Completed |
| Terraform infrastructure provisioning | Completed |
| Amazon ECR image repositories | Completed |
| Jenkins CI/CD pipeline | Completed |
| Automated SSM deployment | Completed |
| Deployment rollback test | Completed |
| Node Exporter | Completed |
| Prometheus integration | Completed |
| Grafana Node Exporter dashboard | Completed |
| Blackbox website availability probe | Completed |
| Grafana alert evaluation | Tested |
| Grafana email/chat notifications | Pending |
| Unified application and infrastructure dashboard | In progress |
| Container-level monitoring | Pending |
| Centralized log management | Pending |
| HTTPS and custom domain | Future enhancement |

### 12. Project Architecture

The overall workflow is:

```text
Developer
    |
    v
GitHub Repository
    |
    v
Jenkins CI/CD Pipeline
    |
    +--> Validate Configuration
    |
    +--> Run Application Tests
    |
    +--> Build Docker Images
    |
    +--> Push Images to Amazon ECR
    |
    v
AWS Systems Manager
    |
    v
Ubuntu EC2 Instance
    |
    v
Docker Compose
    |
    +--> Nginx Reverse Proxy
    |
    +--> React Frontend
    |
    +--> User Service
    |
    +--> Product Service
    |
    +--> Order Service

Monitoring:
EC2 Node Exporter --> SSM Port Forwarding --> Prometheus --> Grafana

Website Availability:
ShopSphere Website <-- Blackbox Exporter <-- Prometheus
```

### 13. Key DevOps Concepts Demonstrated

Through this project, the following practical DevOps concepts were implemented:

- Infrastructure as Code using Terraform.
- Continuous Integration and Continuous Deployment using Jenkins.
- Containerization using Docker.
- Multi-container application management using Docker Compose.
- Container image versioning and registry management using Amazon ECR.
- Reverse proxy configuration using Nginx.
- AWS IAM roles and permissions.
- Secure remote administration using AWS Systems Manager.
- Automated deployment and rollback.
- Infrastructure and application monitoring using Prometheus and Grafana.
- Website availability monitoring using Blackbox Exporter.
- Troubleshooting, service health checks and deployment verification.

---

## Future Improvements

The following improvements can be considered for a more production-ready environment:

- Configure HTTPS using a valid TLS certificate.
- Configure a custom domain name.
- Add centralized application logging.
- Add container-level monitoring.
- Configure Grafana notification channels.
- Introduce automated integration and security testing.
- Implement high availability and load balancing when required.
- Move Terraform state to a secured remote backend.

## Conclusion

ShopSphere demonstrates an end-to-end DevOps implementation, starting from application source code and continuing through automated CI/CD, AWS infrastructure provisioning, container deployment, rollback and monitoring.

The project provides practical experience with the tools and workflows commonly used by DevOps and Cloud Engineers.
