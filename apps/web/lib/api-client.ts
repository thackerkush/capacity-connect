const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

export class ApiError extends Error {
  constructor(public status: number, message: string, public data?: any) {
    super(message);
    this.name = 'ApiError';
  }
}

// Tracks whether a refresh is already in-flight so concurrent 401s
// don't trigger multiple refresh attempts simultaneously.
let isRefreshing = false;
let refreshSubscribers: Array<(ok: boolean) => void> = [];

function onRefreshComplete(ok: boolean) {
  refreshSubscribers.forEach((cb) => cb(ok));
  refreshSubscribers = [];
}

async function attemptRefresh(): Promise<boolean> {
  if (isRefreshing) {
    // Wait for the already-in-flight refresh to complete
    return new Promise((resolve) => {
      refreshSubscribers.push(resolve);
    });
  }

  isRefreshing = true;
  try {
    const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    const ok = res.ok;
    onRefreshComplete(ok);
    return ok;
  } catch {
    onRefreshComplete(false);
    return false;
  } finally {
    isRefreshing = false;
  }
}

export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {},
  _isRetry = false,
): Promise<T> {
  // Tokens are transported exclusively via httpOnly cookies.
  // Never read from localStorage — that would expose tokens to XSS.
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const response = await fetch(`${API_BASE_URL}${cleanEndpoint}`, {
    ...options,
    headers,
    credentials: 'include', // Always send cookies (access_token + refresh_token)
  });

  // On 401, attempt a silent token refresh then retry the original request once.
  // We skip this for auth endpoints to allow them to handle their own 401s (e.g. invalid credentials).
  const isAuthEndpoint = cleanEndpoint.startsWith('/auth/login') || cleanEndpoint.startsWith('/auth/register') || cleanEndpoint.startsWith('/auth/refresh');
  
  if (response.status === 401 && !_isRetry && !isAuthEndpoint) {
    const refreshed = await attemptRefresh();
    if (refreshed) {
      // Retry the original request with the new access_token cookie
      return apiRequest<T>(endpoint, options, true);
    }
    // Refresh failed — dispatch a global event so AuthProvider can log the user out.
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('auth:session-expired'));
    }
    throw new ApiError(401, 'Session expired. Please sign in again.');
  }

  if (!response.ok) {
    let errorMessage = 'An error occurred';
    let errorData: any = null;
    try {
      errorData = await response.json();
      if (typeof errorData?.error?.message === 'string') {
        errorMessage = errorData.error.message;
      } else if (typeof errorData?.message === 'string') {
        errorMessage = errorData.message;
      } else if (Array.isArray(errorData?.message)) {
        errorMessage = errorData.message.join(', ');
      } else if (typeof errorData?.error === 'string') {
        errorMessage = errorData.error;
      } else if (typeof errorData?.message === 'object') {
        errorMessage = JSON.stringify(errorData.message);
      }
    } catch {
      errorMessage = response.statusText || errorMessage;
    }
    throw new ApiError(response.status, errorMessage, errorData);
  }

  if (response.status === 204) return {} as T;

  try {
    return await response.json();
  } catch {
    return {} as T;
  }
}

export const api = {
  get: <T = any>(url: string) => apiRequest<T>(url, { method: 'GET' }),
  post: <T = any>(url: string, body?: any) =>
    apiRequest<T>(url, { method: 'POST', body: JSON.stringify(body) }),
  put: <T = any>(url: string, body?: any) =>
    apiRequest<T>(url, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T = any>(url: string, body?: any) =>
    apiRequest<T>(url, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T = any>(url: string) => apiRequest<T>(url, { method: 'DELETE' }),
};
