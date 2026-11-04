# ShopSphere
Infrastructure Diagram 
![Uploading Untitled Diagram.drawio (3).png…]()


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

## Not included yet

The Jenkinsfile, Terraform configuration, EC2 setup and deployment scripts are separate deliverables in the
assignment and are not part of this application code.
