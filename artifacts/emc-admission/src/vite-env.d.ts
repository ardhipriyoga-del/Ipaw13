/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * URL absolut ke Express API server.
   * Set saat build untuk Netlify / hosting statis.
   * Kosongkan untuk local dev (URL relatif dipakai otomatis).
   *
   * Contoh: VITE_API_BASE_URL=https://api.ipaw.example.com
   */
  readonly VITE_API_BASE_URL?: string;

  readonly BASE_URL: string;
  readonly MODE: string;
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly SSR: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
