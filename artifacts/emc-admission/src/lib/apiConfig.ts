/**
 * API Base URL configuration.
 *
 * URL API dipisahkan dari URL aplikasi agar frontend yang di-host secara statis
 * (Netlify, Vercel, dsb.) tetap bisa memanggil Express API server yang
 * di-deploy di tempat lain (Railway, Render, VPS, dsb.).
 *
 * Priority:
 *  1. VITE_API_BASE_URL  — set saat build untuk Netlify/production
 *     Contoh: VITE_API_BASE_URL=https://api.ipaw.example.com
 *  2. String kosong      — URL relatif, bekerja di local dev (same origin)
 *
 * JANGAN gunakan window.location.origin sebagai base URL API.
 * Gunakan variabel ini sebagai satu-satunya sumber kebenaran.
 */
export function getApiBaseUrl(): string {
  const envUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';
  return envUrl.trim().replace(/\/$/, ''); // hapus trailing slash
}

/**
 * Bangun URL API absolut dari path relatif, misal:
 *   apiUrl('/api/cloud/status') → '' + '/api/cloud/status'  (local)
 *                              → 'https://api.example.com/api/cloud/status' (prod)
 */
export function apiUrl(path: string): string {
  const base = getApiBaseUrl();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${cleanPath}`;
}

/**
 * Deteksi apakah API proxy tersedia (Express server atau Netlify Functions).
 *
 * Proxy tersedia jika:
 *  - VITE_API_BASE_URL dikonfigurasi (API server eksternal), ATAU
 *  - VITE_HAS_API_PROXY=true di-set saat build (Netlify Functions via netlify.toml), ATAU
 *  - Aplikasi berjalan di konteks http:// atau https:// (termasuk localhost,
 *    Replit dev, Replit production, atau domain custom manapun)
 *
 * Mode file:// (offline standalone HTML) → false
 *
 * Catatan: pendekatan ini lebih aman dari allowlist domain karena semua
 * deployment berbasis web (termasuk Replit production dengan berbagai format
 * domain) akan otomatis menggunakan proxy — tanpa perlu update allowlist.
 */
export function hasApiProxy(): boolean {
  // Jika ada base URL eksplisit → proxy eksternal dikonfigurasi
  if (getApiBaseUrl() !== '') return true;

  // Netlify Functions: flag di-set via netlify.toml [build.environment]
  if ((import.meta.env.VITE_HAS_API_PROXY as string | undefined) === 'true') return true;

  if (typeof window === 'undefined') return false;

  // Hanya file:// (mode offline standalone) yang tidak punya proxy.
  // Semua konteks http:// dan https:// — termasuk localhost, Replit dev,
  // Replit production, dan domain custom — memiliki /api yang dirouting
  // ke Express API server.
  const protocol = window.location.protocol;
  return protocol === 'http:' || protocol === 'https:';
}
