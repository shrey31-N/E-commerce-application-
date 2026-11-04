const test = require('node:test');
const assert = require('node:assert');
const { createApp } = require('../src/app');

async function withServer(fn) {
  const server = createApp().listen(0);
  try {
    await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.close();
  }
}

test('health endpoint responds ok', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/health`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual((await res.json()).service, 'product-service');
  });
});

test('lists products and filters by category and search', async () => {
  await withServer(async (base) => {
    const all = await (await fetch(`${base}/api/products`)).json();
    assert.ok(all.count >= 10);

    const fashion = await (await fetch(`${base}/api/products?category=fashion`)).json();
    assert.ok(fashion.count > 0);
    assert.ok(fashion.products.every((p) => p.category === 'Fashion'));

    const search = await (await fetch(`${base}/api/products?q=headphones`)).json();
    assert.strictEqual(search.products[0].name, 'Wireless Headphones');
  });
});

test('returns product details and 404 for unknown id', async () => {
  await withServer(async (base) => {
    const ok = await fetch(`${base}/api/products/1`);
    assert.strictEqual(ok.status, 200);
    assert.strictEqual((await ok.json()).product.id, 1);

    const missing = await fetch(`${base}/api/products/9999`);
    assert.strictEqual(missing.status, 404);
  });
});
