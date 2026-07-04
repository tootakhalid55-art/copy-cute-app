import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type AuthUser = { email: string; name: string };
type Ctx = {
  user: AuthUser | null;
  ready: boolean;
  login: (email: string, password: string) => boolean;
  logout: () => void;
  updateName: (name: string) => void;
};
const AuthCtx = createContext<Ctx | null>(null);
const KEY = "haseem:auth";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setUser(JSON.parse(raw));
    } catch {}
    setReady(true);
  }, []);

  const login = (email: string, password: string) => {
    if (!email.includes("@") || password.length < 4) return false;
    const u: AuthUser = { email, name: email.split("@")[0] || "مستخدم" };
    localStorage.setItem(KEY, JSON.stringify(u));
    setUser(u);
    return true;
  };
  const logout = () => {
    localStorage.removeItem(KEY);
    setUser(null);
  };
  const updateName = (name: string) => {
    setUser((u) => {
      if (!u) return u;
      const next = { ...u, name };
      localStorage.setItem(KEY, JSON.stringify(next));
      return next;
    });
  };

  return (
    <AuthCtx.Provider value={{ user, ready, login, logout, updateName }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const c = useContext(AuthCtx);
  if (!c) throw new Error("AuthProvider missing");
  return c;
}
