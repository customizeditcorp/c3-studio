export async function register() {
  // Node.js v22+ exposes localStorage as a partial object without getItem/setItem.
  // @supabase/ssr and next-themes call localStorage.getItem during SSR and crash.
  // This no-op shim satisfies those calls without side-effects on the server.
  if (typeof window === 'undefined' && typeof localStorage !== 'undefined') {
    const _localStorage = localStorage as unknown as Record<string, unknown>;
    if (typeof _localStorage.getItem !== 'function') {
      _localStorage.getItem = () => null;
      _localStorage.setItem = () => {};
      _localStorage.removeItem = () => {};
      _localStorage.clear = () => {};
      _localStorage.key = () => null;
    }
  }
}
