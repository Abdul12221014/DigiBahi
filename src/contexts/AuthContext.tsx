/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { isFirstRun as checkFirstRun } from '@/lib/db';
import { login as authLogin, logout as authLogout, setCurrentUser, resetUserPassword } from '@/lib/auth';
import type { LoginResult } from '@/lib/auth';

export interface AuthUser {
  id?: number;
  username: string;
  displayName?: string;
  role: 'owner' | 'accountant' | 'employee';
  sessionToken: string;
  /** True when this account was migrated from a PIN and needs a new password set. */
  mustResetPassword: boolean;
  source: 'backend' | 'offline';
}

interface AuthContextType {
  isAuthenticated: boolean;
  /** null = checking, true = no users yet, false = users exist. */
  isFirstRun: boolean | null;
  user: AuthUser | null;
  /** Log in with any identifier (email, mobile, or username) + password. */
  login: (identifier: string, password: string, options?: { rememberMe?: boolean }) => Promise<LoginResult>;
  logout: () => Promise<void>;
  /** Soft-lock: clears auth state without destroying the session token. */
  lockScreen: () => void;
  completeFirstRun: () => void;
  /** After a forced password reset, mark the current session as upgraded. */
  clearMustResetPassword: () => void;
  /** Owner-initiated password reset for any user by ID. */
  resetPassword: (userId: number, newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isFirstRunState, setIsFirstRunState] = useState<boolean | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    checkFirstRun()
      .then(firstRun => setIsFirstRunState(firstRun))
      .catch(() => setIsFirstRunState(true));
  }, []);

  const login = useCallback(async (
    identifier: string,
    password: string,
    options?: { rememberMe?: boolean },
  ): Promise<LoginResult> => {
    const result = await authLogin(identifier, password, options);
    if (result.ok) {
      setUser(result.user);
      setIsAuthenticated(true);
    }
    return result;
  }, []);

  const logout = useCallback(async () => {
    await authLogout();
    setUser(null);
    setIsAuthenticated(false);
  }, []);

  const lockScreen = useCallback(() => {
    setIsAuthenticated(false);
    setUser(null);
    setCurrentUser(null);
  }, []);

  const completeFirstRun = useCallback(() => {
    setIsFirstRunState(false);
  }, []);

  const clearMustResetPassword = useCallback(() => {
    setUser(prev => prev ? { ...prev, mustResetPassword: false } : prev);
  }, []);

  const resetPassword = useCallback(async (userId: number, newPassword: string) => {
    await resetUserPassword(userId, newPassword);
  }, []);

  return (
    <AuthContext.Provider value={{
      isAuthenticated,
      isFirstRun: isFirstRunState,
      user,
      login,
      logout,
      lockScreen,
      completeFirstRun,
      clearMustResetPassword,
      resetPassword,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
