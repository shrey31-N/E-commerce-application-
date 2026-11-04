const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const jwt = require('jsonwebtoken');
const { createApp } = require('../src/app');

const SECRET = 'test-secret';
const catalog = {
  1: { id: 1, name: 'Wireless Headphones', price: 2499, image: '🎧' },
  9: { id: 9, name: 'Ceramic Coffee Mug', price: 349, image: '☕' },
};
const tokenFor = (sub) => jwt.sign({ sub, email: `${sub}@example.com`, name: sub }, SECRET);

async function withServer(fn, productLookup = async (id) => catalog[id] || null) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'order-svc-'));
  const server = createApp({ dataDir, jwtSecret: SECRET, productLookup }).listen(0);
  try {
    await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.close();
  }
}
const call = (url, token, body) =>
  fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });

test('health endpoint responds ok', async () => {
  await withServer(async (base) => {
    assert.strictEqual((await fetch(`${base}/health`)).status, 200);
  });
});

test('orders require authentication', async () => {
  await withServer(async (base) => {
    assert.strictEqual((await call(`${base}/api/orders`)).status, 401);
    assert.strictEqual((await call(`${base}/api/orders`, 'garbage', { items: [] })).status, 401);
  });
});

test('places an order, computes total and returns per-user history', async () => {
  await withServer(async (base) => {
    const alice = tokenFor('alice');
    const bob = tokenFor('bob');

    const res = await call(`${base}/api/orders`, alice, {
      items: [{ productId: 1, quantity: 1 }, { productId: 9, quantity: 2 }],
    });
    assert.strictEqual(res.status, 201);
    const { order } = await res.json();
    assert.strictEqual(order.total, 2499 + 349 * 2);
    assert.strictEqual(order.status, 'PLACED');

    const aliceHistory = await (await call(`${base}/api/orders`, alice)).json();
    assert.strictEqual(aliceHistory.count, 1);
    const bobHistory = await (await call(`${base}/api/orders`, bob)).json();
    assert.strictEqual(bobHistory.count, 0);

    assert.strictEqual((await call(`${base}/api/orders/${order.id}`, bob)).status, 404);
    assert.strictEqual((await call(`${base}/api/orders/${order.id}`, alice)).status, 200);
  });
});

test('rejects unknown products and bad quantities', async () => {
  await withServer(async (base) => {
    const t = tokenFor('alice');
    assert.strictEqual((await call(`${base}/api/orders`, t, { items: [{ productId: 99, quantity: 1 }] })).status, 400);
    assert.strictEqual((await call(`${base}/api/orders`, t, { items: [{ productId: 1, quantity: 0 }] })).status, 400);
    assert.strictEqual((await call(`${base}/api/orders`, t, { items: [] })).status, 400);
  });
});

test('returns 503 when product service is unavailable', async () => {
  await withServer(
    async (base) => {
      const res = await call(`${base}/api/orders`, tokenFor('alice'), { items: [{ productId: 1, quantity: 1 }] });
      assert.strictEqual(res.status, 503);
    },
    async () => {
      throw new Error('connect ECONNREFUSED');
    }
  );
});
