const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const client = require('prom-client');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function createApp({
  dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data'),
  jwtSecret = process.env.JWT_SECRET || 'dev-secret-change-me',
} = {}) {
  const app = express();
  app.use(express.json());

  // ---- metrics ----
  const register = new client.Registry();
  client.collectDefaultMetrics({ register });
  const httpDuration = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status'],
    registers: [register],
  });
  const registrations = new client.Counter({
    name: 'shopsphere_user_registrations_total',
    help: 'Total successful user registrations',
    registers: [register],
  });
  const logins = new client.Counter({
    name: 'shopsphere_user_logins_total',
    help: 'Login attempts by result',
    labelNames: ['result'],
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

  // ---- storage (JSON file on a persistent volume) ----
  fs.mkdirSync(dataDir, { recursive: true });
  const file = path.join(dataDir, 'users.json');
  let users = [];
  try {
    users = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    users = [];
  }
  const save = () => fs.writeFileSync(file, JSON.stringify(users, null, 2));
  const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email });
  const sign = (u) => jwt.sign({ sub: u.id, email: u.email, name: u.name }, jwtSecret, { expiresIn: '2h' });

  // ---- ops endpoints ----
  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'user-service' }));
  app.get('/metrics', async (_req, res) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  });

  // ---- API ----
  app.post('/api/users/register', async (req, res) => {
    const { name, email, password } = req.body || {};
    if (!name || !email || !password) return res.status(400).json({ error: 'name, email and password are required' });
    if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'invalid email' });
    if (String(password).length < 6) return res.status(400).json({ error: 'password must be at least 6 characters' });
    const normalized = String(email).trim().toLowerCase();
    if (users.some((u) => u.email === normalized)) return res.status(409).json({ error: 'email already registered' });
    const user = {
      id: crypto.randomUUID(),
      name: String(name).trim(),
      email: normalized,
      passwordHash: await bcrypt.hash(String(password), 10),
      createdAt: new Date().toISOString(),
    };
    users.push(user);
    save();
    registrations.inc();
    res.status(201).json({ token: sign(user), user: publicUser(user) });
  });

  app.post('/api/users/login', async (req, res) => {
    const { email, password } = req.body || {};
    const user = users.find((u) => u.email === String(email || '').trim().toLowerCase());
    if (!user || !(await bcrypt.compare(String(password || ''), user.passwordHash))) {
      logins.inc({ result: 'failure' });
      return res.status(401).json({ error: 'invalid email or password' });
    }
    logins.inc({ result: 'success' });
    res.json({ token: sign(user), user: publicUser(user) });
  });

  app.get('/api/users/me', (req, res) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    try {
      const payload = jwt.verify(token, jwtSecret);
      const user = users.find((u) => u.id === payload.sub);
      if (!user) return res.status(404).json({ error: 'user not found' });
      res.json({ user: publicUser(user) });
    } catch (_) {
      res.status(401).json({ error: 'invalid or missing token' });
    }
  });

  return app;
}

module.exports = { createApp };
