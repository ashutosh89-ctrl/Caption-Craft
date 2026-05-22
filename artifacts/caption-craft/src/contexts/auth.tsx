import { createContext, useContext, useEffect, useState, useCallback } from "react";

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  image: string | null;
  status: string;
  usageCounter: number;
  usageResetAt: string;
}

interface AuthState {
  isLoading: boolean;
  isAuthenticated: boolean;
  authEnabled: boolean;
  user: AuthUser | null;
  refetch: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  isLoading: true,
  isAuthenticated: false,
  authEnabled: false,
  user: null,
  refetch: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<Omit<AuthState, "refetch" | "logout">>({
    isLoading: true,
    isAuthenticated: false,
    authEnabled: false,
    user: null,
  });

  const fetchMe = useCallback(async () => {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/auth/me`, { credentials: "include" });
      if (res.ok) {
        const data = (await res.json()) as {
          authenticated: boolean;
          authEnabled: boolean;
          user?: AuthUser;
        };
        setState({
          isLoading: false,
          isAuthenticated: data.authenticated,
          authEnabled: data.authEnabled,
          user: data.user ?? null,
        });
      } else {
        setState({ isLoading: false, isAuthenticated: false, authEnabled: true, user: null });
      }
    } catch {
      setState({ isLoading: false, isAuthenticated: false, authEnabled: false, user: null });
    }
  }, []);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  const logout = async () => {
    await fetch(`${import.meta.env.BASE_URL}api/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
    await fetchMe();
  };

  return (
    <AuthContext.Provider value={{ ...state, refetch: fetchMe, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
