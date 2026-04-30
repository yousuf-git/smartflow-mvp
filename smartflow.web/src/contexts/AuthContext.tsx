import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";

export type AuthUser = {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  role: "admin" | "manager" | "customer";
  phone?: string | null;
};

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const ROLE_REDIRECTS: Record<string, string> = {
  admin: "/admin",
  manager: "/manager",
  customer: "/app",
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(
    () => localStorage.getItem("sf_token"),
  );
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (!token) {
      setIsLoading(false);
      return;
    }
    api
      .get<AuthUser>("/api/auth/me")
      .then(({ data }) => setUser(data))
      .catch(() => {
        localStorage.removeItem("sf_token");
        setToken(null);
      })
      .finally(() => setIsLoading(false));
  }, [token]);

  const login = useCallback(
    async (email: string, password: string, rememberMe = false) => {
      const { data } = await api.post<{ token: string; user: AuthUser }>(
        "/api/auth/login",
        { email, password, remember_me: rememberMe },
      );
      localStorage.setItem("sf_token", data.token);
      setToken(data.token);
      setUser(data.user);
      navigate(ROLE_REDIRECTS[data.user.role] ?? "/");
    },
    [navigate],
  );

  const logout = useCallback(() => {
    localStorage.removeItem("sf_token");
    setToken(null);
    setUser(null);
    navigate("/login");
  }, [navigate]);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
