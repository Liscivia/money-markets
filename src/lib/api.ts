export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, options);
  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = body.error || body.message || '';
    } catch {}
    throw new Error(detail || `Request failed (${res.status})`);
  }
  return res.json();
}
