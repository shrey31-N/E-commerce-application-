import React, { useEffect, useState, useCallback } from 'react';
import { api, session, money } from './api.js';

const CATEGORIES = ['All', 'Electronics', 'Fashion', 'Home', 'Sports'];

function Notice({ notice }) {
  if (!notice) return null;
  return <div className={`notice ${notice.type}`}>{notice.text}</div>;
}

function Products({ onOpen, onAdd }) {
  const [list, setList] = useState([]);
  const [category, setCategory] = useState('All');
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => {
      api
        .products({ category: category === 'All' ? '' : category, q })
        .then((d) => {
          setList(d.products);
          setError('');
        })
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    }, 200);
    return () => clearTimeout(t);
  }, [category, q]);

  return (
    <section>
      <div className="toolbar">
        <div className="chips">
          {CATEGORIES.map((c) => (
            <button key={c} className={`chip ${c === category ? 'active' : ''}`} onClick={() => setCategory(c)}>
              {c}
            </button>
          ))}
        </div>
        <input className="search" placeholder="Search products…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {error && <div className="notice error">Could not load products: {error}</div>}
      {loading && !list.length ? <p className="muted">Loading…</p> : null}
      <div className="grid">
        {list.map((p) => (
          <article key={p.id} className="card">
            <button className="card-thumb" onClick={() => onOpen(p.id)} aria-label={`View ${p.name}`}>
              {p.image}
            </button>
            <div className="card-body">
              <span className="tag">{p.category}</span>
              <h3>{p.name}</h3>
              <div className="card-foot">
                <strong>{money(p.price)}</strong>
                <button className="btn small" onClick={() => onAdd(p)}>
                  Add to cart
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
      {!loading && !error && list.length === 0 && <p className="muted">No products match your search.</p>}
    </section>
  );
}

function ProductDetail({ id, onBack, onAdd }) {
  const [product, setProduct] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api
      .product(id)
      .then((d) => setProduct(d.product))
      .catch((e) => setError(e.message));
  }, [id]);

  if (error) return <div className="notice error">{error}</div>;
  if (!product) return <p className="muted">Loading…</p>;
  return (
    <section className="detail">
      <button className="link" onClick={onBack}>
        ← Back to products
      </button>
      <div className="detail-grid">
        <div className="detail-thumb">{product.image}</div>
        <div>
          <span className="tag">{product.category}</span>
          <h2>{product.name}</h2>
          <p className="price">{money(product.price)}</p>
          <p>{product.description}</p>
          <p className="muted">{product.stock > 0 ? `${product.stock} in stock` : 'Out of stock'}</p>
          <button className="btn" onClick={() => onAdd(product)}>
            Add to cart
          </button>
        </div>
      </div>
    </section>
  );
}

function Cart({ cart, setCart, user, onCheckout, onNeedLogin, busy }) {
  const total = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const setQty = (id, qty) =>
    setCart((c) => c.map((i) => (i.id === id ? { ...i, quantity: Math.max(1, Math.min(20, qty)) } : i)));
  const remove = (id) => setCart((c) => c.filter((i) => i.id !== id));

  if (!cart.length) return <p className="muted">Your cart is empty.</p>;
  return (
    <section>
      <h2>Your cart</h2>
      <table className="table">
        <tbody>
          {cart.map((i) => (
            <tr key={i.id}>
              <td className="emoji">{i.image}</td>
              <td>{i.name}</td>
              <td>{money(i.price)}</td>
              <td>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={i.quantity}
                  onChange={(e) => setQty(i.id, Number(e.target.value))}
                  className="qty"
                />
              </td>
              <td>{money(i.price * i.quantity)}</td>
              <td>
                <button className="link danger" onClick={() => remove(i.id)}>
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="cart-total">
        <span>Total</span>
        <strong>{money(total)}</strong>
      </div>
      {user ? (
        <button className="btn" onClick={onCheckout} disabled={busy}>
          {busy ? 'Placing order…' : 'Place order'}
        </button>
      ) : (
        <button className="btn" onClick={onNeedLogin}>
          Log in to place order
        </button>
      )}
    </section>
  );
}

function Orders({ onShop }) {
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api
      .orders()
      .then((d) => setOrders(d.orders))
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="notice error">{error}</div>;
  if (!orders) return <p className="muted">Loading…</p>;
  if (!orders.length)
    return (
      <p className="muted">
        No orders yet.{' '}
        <button className="link" onClick={onShop}>
          Start shopping
        </button>
      </p>
    );
  return (
    <section>
      <h2>Order history</h2>
      {orders.map((o) => (
        <div key={o.id} className="order">
          <div className="order-head">
            <span>
              Order <code>{o.id.slice(0, 8)}</code> · {new Date(o.createdAt).toLocaleString()}
            </span>
            <span className="badge">{o.status}</span>
          </div>
          <ul>
            {o.items.map((i) => (
              <li key={i.productId}>
                {i.image} {i.name} × {i.quantity} — {money(i.price * i.quantity)}
              </li>
            ))}
          </ul>
          <strong>Total: {money(o.total)}</strong>
        </div>
      ))}
    </section>
  );
}

function AuthForm({ mode, onDone, onSwitch }) {
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const isRegister = mode === 'register';
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = isRegister ? await api.register(form) : await api.login(form);
      onDone(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="auth" onSubmit={submit}>
      <h2>{isRegister ? 'Create account' : 'Welcome back'}</h2>
      {error && <div className="notice error">{error}</div>}
      {isRegister && (
        <label>
          Name
          <input value={form.name} onChange={set('name')} required />
        </label>
      )}
      <label>
        Email
        <input type="email" value={form.email} onChange={set('email')} required />
      </label>
      <label>
        Password
        <input type="password" minLength={6} value={form.password} onChange={set('password')} required />
      </label>
      <button className="btn" disabled={busy}>
        {busy ? 'Please wait…' : isRegister ? 'Register' : 'Log in'}
      </button>
      <p className="muted">
        {isRegister ? 'Already have an account?' : 'New to ShopSphere?'}{' '}
        <button type="button" className="link" onClick={onSwitch}>
          {isRegister ? 'Log in' : 'Register'}
        </button>
      </p>
    </form>
  );
}

export default function App() {
  const [view, setView] = useState({ name: 'products' });
  const [user, setUser] = useState(session.user);
  const [cart, setCart] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('shopsphere_cart')) || [];
    } catch {
      return [];
    }
  });
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => localStorage.setItem('shopsphere_cart', JSON.stringify(cart)), [cart]);

  const flash = useCallback((type, text) => {
    setNotice({ type, text });
    setTimeout(() => setNotice(null), 3500);
  }, []);

  const go = (name, extra = {}) => setView({ name, ...extra });
  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);

  const addToCart = (p) => {
    setCart((c) => {
      const existing = c.find((i) => i.id === p.id);
      if (existing) return c.map((i) => (i.id === p.id ? { ...i, quantity: Math.min(20, i.quantity + 1) } : i));
      return [...c, { id: p.id, name: p.name, price: p.price, image: p.image, quantity: 1 }];
    });
    flash('success', `${p.name} added to cart`);
  };

  const onAuth = ({ token, user: u }) => {
    session.save(token, u);
    setUser(u);
    go(cart.length ? 'cart' : 'products');
    flash('success', `Signed in as ${u.name}`);
  };

  const logout = () => {
    session.clear();
    setUser(null);
    go('products');
  };

  const checkout = async () => {
    setBusy(true);
    try {
      await api.placeOrder(cart.map((i) => ({ productId: i.id, quantity: i.quantity })));
      setCart([]);
      go('orders');
      flash('success', 'Order placed successfully!');
    } catch (err) {
      if (err.status === 401) {
        logout();
        go('login');
        flash('error', 'Session expired — please log in again');
      } else {
        flash('error', err.message);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app">
      <header className="nav">
        <button className="brand" onClick={() => go('products')}>
          🛍️ ShopSphere
        </button>
        <nav>
          <button className="link" onClick={() => go('products')}>
            Products
          </button>
          <button className="link" onClick={() => go('cart')}>
            Cart{cartCount > 0 && <span className="pill">{cartCount}</span>}
          </button>
          {user ? (
            <>
              <button className="link" onClick={() => go('orders')}>
                My orders
              </button>
              <span className="muted">Hi, {user.name.split(' ')[0]}</span>
              <button className="link" onClick={logout}>
                Log out
              </button>
            </>
          ) : (
            <>
              <button className="link" onClick={() => go('login')}>
                Log in
              </button>
              <button className="btn small" onClick={() => go('register')}>
                Register
              </button>
            </>
          )}
        </nav>
      </header>
      <main>
        <Notice notice={notice} />
        {view.name === 'products' && <Products onOpen={(id) => go('detail', { id })} onAdd={addToCart} />}
        {view.name === 'detail' && <ProductDetail id={view.id} onBack={() => go('products')} onAdd={addToCart} />}
        {view.name === 'cart' && (
          <Cart cart={cart} setCart={setCart} user={user} onCheckout={checkout} onNeedLogin={() => go('login')} busy={busy} />
        )}
        {view.name === 'orders' && (user ? <Orders onShop={() => go('products')} /> : <AuthForm mode="login" onDone={onAuth} onSwitch={() => go('register')} />)}
        {view.name === 'login' && <AuthForm mode="login" onDone={onAuth} onSwitch={() => go('register')} />}
        {view.name === 'register' && <AuthForm mode="register" onDone={onAuth} onSwitch={() => go('login')} />}
      </main>
      <footer className="footer">ShopSphere · microservices demo for the AWS DevOps assignment</footer>
    </div>
  );
}
