'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from './api-client';

export interface UserSession {
  id: string;
  email: string;
  roles: string[];
}

interface AuthContextType {
  user: UserSession | null;
  isLoading: boolean;
  isLoggingOut: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, role: string) => Promise<void>;
  logout: () => Promise<void>;
  hasRole: (role: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const router = useRouter();

  // Restore session identity from sessionStorage (NOT the token — that lives in httpOnly cookies).
  // sessionStorage is scoped to the tab and cleared when the browser is closed,
  // reducing the exposure window vs localStorage.
  useEffect(() => {
    try {
      const savedUser = sessionStorage.getItem('user_session');
      if (savedUser) {
        setUser(JSON.parse(savedUser));
      }
    } catch {
      sessionStorage.removeItem('user_session');
    }
    setIsLoading(false);
  }, []);

  // C-2: Listen for the global session-expired event fired by api-client
  // when a silent token refresh fails. Force logout immediately.
  const handleSessionExpired = useCallback(() => {
    setUser(null);
    sessionStorage.removeItem('user_session');
    router.push('/?auth=true');
  }, [router]);

  useEffect(() => {
    window.addEventListener('auth:session-expired', handleSessionExpired);
    return () => window.removeEventListener('auth:session-expired', handleSessionExpired);
  }, [handleSessionExpired]);

  const login = async (email: string, password: string) => {
    // The API sets httpOnly access_token + refresh_token cookies on the response.
    // We never touch those cookies from JS — they are invisible to XSS.
    const res = await api.post('/auth/login', { email, password });

    const roles = res.roles || ['trainee'];
    const session: UserSession = {
      id: res.userId || 'user-' + Date.now(),
      email,
      roles,
    };

    setUser(session);
    // Store only non-sensitive session identity (no token!) in sessionStorage.
    sessionStorage.setItem('user_session', JSON.stringify(session));

    // Role-based redirect
    if (roles.includes('admin')) {
      router.push('/admin/dashboard');
    } else if (roles.includes('trainer')) {
      router.push('/trainer');
    } else {
      router.push('/trainee');
    }
  };

  const register = async (email: string, password: string, role: string) => {
    await api.post('/auth/register', { email, password, role });
  };

  const logout = async () => {
    setIsLoggingOut(true);
    try {
      // Tells the server to invalidate the refresh token and clear the cookies.
      await api.post('/auth/logout');
    } catch {
      // Even if the server call fails, clear the local session.
    } finally {
      setUser(null);
      sessionStorage.removeItem('user_session');
      setIsLoggingOut(false);
      router.push('/');
    }
  };

  const hasRole = (role: string) => {
    return !!user?.roles?.includes(role);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, isLoggingOut, login, register, logout, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
