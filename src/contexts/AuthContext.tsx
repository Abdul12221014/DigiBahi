import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { isFirstRun as checkFirstRun } from '@/lib/db';
import { login as authLogin, logout as authLogout, setCurrentUser, User } from '@/lib/auth';

export interface AuthUser {
  id?: number;
  username: string;
  role: 'owner' | 'accountant' | 'employee';
  sessionToken: string;
  source: 'backend' | 'offline';
}

interface AuthContextType {
  isAuthenticated: boolean;
  isFirstRun: boolean | null;
  user: AuthUser | null;
  login: (username: string, pin: string) => Promise<boolean>;
  logout: () => Promise<void>;
  lockScreen: () => void;
  completeFirstRun: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isFirstRunState, setIsFirstRunState] = useState<boolean | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    checkFirstRun().then(firstRun => setIsFirstRunState(firstRun));
  }, []);

  const login = useCallback(async (username: string, pin: string): Promise<boolean> => {
    const result = await authLogin(username, pin);
    if (!result) return false;
    setUser(result);
    setIsAuthenticated(true);
    return true;
  }, []);

  const logout = useCallback(async () => {
    await authLogout();
    setUser(null);
    setIsAuthenticated(false);
  }, []);

  const lockScreen = useCallback(() => {
    setIsAuthenticated(false);
    setUser(null);
  }, []);

  const completeFirstRun = useCallback(() => {
    setIsFirstRunState(false);
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
