/**
 * Runtime configuration for the Dongi frontend.
 *
 * This file is loaded before the ES modules so a deployment can override any
 * value by defining `window.DONGI_CONFIG` earlier (for example from a
 * deployment-specific inline script). Values here are only defaults.
 *
 * The API base URL currently points at the temporary development backend at
 * http://192.168.1.8:8082 (Swagger: http://192.168.1.8:8082/swagger). Change it
 * when the backend moves, e.g.:
 *
 *   window.DONGI_CONFIG = { apiBaseUrl: 'https://api.dongi.example' };
 */
window.DONGI_CONFIG = Object.assign(
  {
    apiBaseUrl: 'http://192.168.1.8:8082',
    requestTimeoutMs: 8000,
  },
  window.DONGI_CONFIG,
);
