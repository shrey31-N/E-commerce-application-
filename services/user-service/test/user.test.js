const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createApp } = require('../src/app');

async function withServer(fn) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'user-svc-'));
  const server = createApp({ dataDir, jwtSecret: 'test-secret' }).listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base);
  } finally {
    server.close();
  }
}
const post = (url, body) =>
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('health endpoint responds ok', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/health`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual((await res.json()).status, 'ok');
  });
});

test('register, reject duplicate, login, and fetch profile', async () => {
  await withServer(async (base) => {
    const reg = await post(`${base}/api/users/register`, { name: 'Asha', email: 'asha@example.com', password: 'secret123' });
    assert.strictEqual(reg.status, 201);
    const { token } = await reg.json();
    assert.ok(token);

    const dup = await post(`${base}/api/users/register`, { name: 'Asha', email: 'ASHA@example.com', password: 'secret123' });
    assert.strictEqual(dup.status, 409);

    const bad = await post(`${base}/api/users/login`, { email: 'asha@example.com', password: 'wrong' });
    assert.strictEqual(bad.status, 401);

    const ok = await post(`${base}/api/users/login`, { email: 'asha@example.com', password: 'secret123' });
    assert.strictEqual(ok.status, 200);
    const login = await ok.json();

    const me = await fetch(`${base}/api/users/me`, { headers: { Authorization: `Bearer ${login.token}` } });
    assert.strictEqual(me.status, 200);
    assert.strictEqual((await me.json()).user.email, 'asha@example.com');
  });
});

test('validation rejects short passwords and exposes metrics', async () => {
  await withServer(async (base) => {
    const res = await post(`${base}/api/users/register`, { name: 'X', email: 'x@example.com', password: '123' });
    assert.strictEqual(res.status, 400);
    const metrics = await (await fetch(`${base}/metrics`)).text();
    assert.ok(metrics.includes('http_request_duration_seconds'));
  });
});
