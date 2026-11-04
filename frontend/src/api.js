// Thin API client. All calls go through the Nginx gateway using relative URLs.
const TOKEN_KEY = 'shopsphere_token';
const USER_KEY = 'shopsphere_user';

export const session = {
  get token() {
    return localStorage.getItem(TOKEN_KEY);
  },
  get user() {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY));
    } catch {
      return null;
    }
  },
  save(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
};

async function request(path, { method = 'GET', body, auth = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && session.token) headers.Authorization = `Bearer ${session.token}`;
  const res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  register: (body) => request('/api/users/register', { method: 'POST', body }),
  login: (body) => request('/api/users/login', { method: 'POST', body }),
  products: (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
    return request(`/api/products${qs ? `?${qs}` : ''}`);
  },
  product: (id) => request(`/api/products/${id}`),
  placeOrder: (items) => request('/api/orders', { method: 'POST', body: { items }, auth: true }),
  orders: () => request('/api/orders', { auth: true }),
};

export const money = (n) => `₹${Number(n).toLocaleString('en-IN')}`;
