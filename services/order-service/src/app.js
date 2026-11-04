const express = require('express');
const jwt = require('jsonwebtoken');
const client = require('prom-client');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Default lookup: call the Product Service over the Docker network.
function defaultProductLookup(baseUrl) {
  return async (id) => {
    const res = await fetch(`${baseUrl}/api/products/${id}`, { signal: AbortSignal.timeout(3000) });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`product-service responded ${res.status}`);
    return (await res.json()).product;
  };
}

function createApp({
  dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data'),
  jwtSecret = process.env.JWT_SECRET || 'dev-secret-change-me',
  productServiceUrl = process.env.PRODUCT_SERVICE_URL || 'http://localhost:3002',
  productLookup,
} = {}) {
  const lookup = productLookup || defaultProductLookup(productServiceUrl);
  const app = express();
  app.use(express.json());

  const register = new client.Registry();
  client.collectDefaultMetrics({ register });
  const httpDuration = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status'],
    registers: [register],
  });
  const ordersPlaced = new client.Counter({
    name: 'shopsphere_orders_placed_total',
    help: 'Total orders placed',
    registers: [register],
  });
  const orderRevenue = new client.Counter({
    name: 'shopsphere_order_value_total',
    help: 'Sum of placed order totals',
    registers: [register],
  });
  app.use((req, res, next) => {
    const end = httpDuration.startTimer();
    res.on('finish', () => {
      const route = req.route ? req.baseUrl + req.route.path : 'unmatched';
      end({ method: req.method, route, status: res.statusCode });
    });
    next();
  });

  fs.mkdirSync(dataDir, { recursive: true });
  const file = path.join(dataDir, 'orders.json');
  let orders = [];
  try {
    orders = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    orders = [];
  }
  const save = () => fs.writeFileSync(file, JSON.stringify(orders, null, 2));

  const auth = (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    try {
      req.user = jwt.verify(token, jwtSecret);
      next();
    } catch (_) {
      res.status(401).json({ error: 'invalid or missing token' });
    }
  };

  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'order-service' }));
  app.get('/metrics', async (_req, res) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  });

  app.post('/api/orders', auth, async (req, res) => {
    const items = req.body && req.body.items;
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'items must be a non-empty array' });

    const lines = [];
    try {
      for (const item of items) {
        const quantity = Number(item.quantity);
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
          return res.status(400).json({ error: 'quantity must be an integer between 1 and 20' });
        }
        const product = await lookup(item.productId);
        if (!product) return res.status(400).json({ error: `product ${item.productId} not found` });
        lines.push({ productId: product.id, name: product.name, image: product.image, price: product.price, quantity });
      }
    } catch (err) {
      console.error('[order-service] product lookup failed:', err.message);
      return res.status(503).json({ error: 'product service unavailable, please retry' });
    }

    const total = lines.reduce((sum, l) => sum + l.price * l.quantity, 0);
    const order = {
      id: crypto.randomUUID(),
      userId: req.user.sub,
      items: lines,
      total,
      status: 'PLACED',
      createdAt: new Date().toISOString(),
    };
    orders.push(order);
    save();
    ordersPlaced.inc();
    orderRevenue.inc(total);
    res.status(201).json({ order });
  });

  app.get('/api/orders', auth, (req, res) => {
    const mine = orders.filter((o) => o.userId === req.user.sub).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json({ count: mine.length, orders: mine });
  });

  app.get('/api/orders/:id', auth, (req, res) => {
    const order = orders.find((o) => o.id === req.params.id && o.userId === req.user.sub);
    if (!order) return res.status(404).json({ error: 'order not found' });
    res.json({ order });
  });

  return app;
}

module.exports = { createApp };
