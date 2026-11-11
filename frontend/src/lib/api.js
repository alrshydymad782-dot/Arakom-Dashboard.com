// الاتصال بالخادم
export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function api(path, { method, body, signal } = {}) {
  const res = await fetch(`/api${path}`, {
    method: method || (body !== undefined ? 'POST' : 'GET'),
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
    signal,
  });
  const isJson = res.headers.get('content-type')?.includes('json');
  const data = isJson ? await res.json() : null;
  if (res.status === 401 && !path.startsWith('/auth/')) {
    window.dispatchEvent(new Event('arakom:unauthorized'));
  }
  if (!res.ok) throw new ApiError(res.status, data?.error || 'تعذر الاتصال بالخادم');
  return data;
}

export const qs = (obj) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj || {})) if (v !== '' && v !== null && v !== undefined) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
};
