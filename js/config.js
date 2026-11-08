/**
 * Runtime configuration for the Dongi frontend.
 *
 * This file is loaded before the ES modules so a deployment can override any
 * value by defining `window.DONGI_CONFIG` earlier (for example from a
 * deployment-specific inline script). Values here are only defaults.
 *
 * The API base URL points at the ASP.NET Core scaffold from issue #1. Change it
 * when the backend runs on another host or port, e.g.:
 *
 *   window.DONGI_CONFIG = { apiBaseUrl: 'https://api.dongi.example' };
 */
window.DONGI_CONFIG = Object.assign(
  {
    apiBaseUrl: 'http://localhost:5080',
    requestTimeoutMs: 8000,
  },
  window.DONGI_CONFIG,
);
