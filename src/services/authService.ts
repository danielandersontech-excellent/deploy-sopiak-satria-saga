/**
 * authService.ts
 * ----------------------------------------------------
 * DEPRECATED — kept only to satisfy any legacy imports.
 *
 * All authentication logic now lives in:
 *   - src/stores/authStore.ts   (Zustand store: login, logout, restoreSession, etc.)
 *   - src/lib/apiClient.ts      (authApi.login / authApi.me / authApi.logout / authApi.changePin)
 *
 * Do NOT add new code here. Import from `authStore` or `apiClient` instead.
 *
 * If you have an old import like `import { ... } from '../services/authService'`,
 * migrate it: typically `useAuthStore` is what you want.
 */

// Intentional empty re-export to keep this module valid while signalling deprecation.
export {};