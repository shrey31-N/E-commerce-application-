const express = require('express');
const client = require('prom-client');
const products = require('./products.json');

function createApp() {
  const app = express();

  const register = new client.Registry();
  client.collectDefaultMetrics({ register });
  const httpDuration = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status'],
    registers: [register],
  });
  const productViews = new client.Counter({
    name: 'shopsphere_product_detail_views_total',
    help: 'Number of product detail page requests',
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

  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'product-service' }));
  app.get('/metrics', async (_req, res) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  });

  app.get('/api/products', (req, res) => {
    const { category, q } = req.query;
    let result = products;
    if (category) result = result.filter((p) => p.category.toLowerCase() === String(category).toLowerCase());
    if (q) {
      const needle = String(q).toLowerCase();
      result = result.filter((p) => p.name.toLowerCase().includes(needle) || p.description.toLowerCase().includes(needle));
    }
    res.json({ count: result.length, products: result });
  });

  app.get('/api/products/:id', (req, res) => {
    const product = products.find((p) => p.id === Number(req.params.id));
    if (!product) return res.status(404).json({ error: 'product not found' });
    productViews.inc();
    res.json({ product });
  });

  return app;
}

module.exports = { createApp };
