/**
 * API Configuration Utility
 * Dynamically determines the API base URL based on environment and current hostname
 * Supports LAN access by using the current hostname instead of hardcoded localhost
 */

/**
 * Get the API base URL
 * Priority:
 * 1. VITE_API_URL environment variable (if set)
 * 2. Current hostname (for LAN access)
 * 3. localhost (fallback for development)
 */
export function getApiBaseUrl(): string {
  // Check if VITE_API_URL is explicitly set
  const envUrl = import.meta.env?.VITE_API_URL;
  if (envUrl) {
    return envUrl;
  }

  // For browser environment, use current hostname (works for LAN access)
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
    // If accessing via IP or non-localhost, use that hostname
    if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
      return `${protocol}//${hostname}:8000`;
    }
  }

  // Fallback to localhost
  return 'http://localhost:8000';
}

/**
 * Get the WebSocket URL with session token as query param.
 * The backend validates the token on upgrade and closes with 1008 if invalid.
 */
export function getWebSocketUrl(sessionToken?: string): string {
  const baseUrl = getApiBaseUrl();
  const wsProtocol = baseUrl.startsWith('https') ? 'wss:' : 'ws:';
  const url = new URL(baseUrl.replace(/^https?:/, wsProtocol));
  const wsUrl = `${url.origin}/api/v1/sync/ws`;
  return sessionToken ? `${wsUrl}?token=${encodeURIComponent(sessionToken)}` : wsUrl;
}

/**
 * Get the full API endpoint URL
 */
export function getApiUrl(path: string): string {
  const baseUrl = getApiBaseUrl();
  // Ensure path starts with /
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}/api/v1${cleanPath}`;
}







