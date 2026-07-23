import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AuthUser = { id: string; email: string; name: string };

type Ctx = {
  user: AuthUser | null;
  session: Session | null;
  ready: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, name?: string) => Promise<{ error: string | null }>;
  logout: () => Promise<void>;
  updateName: (name: string) => Promise<void>;
  /** legacy sync alias — returns false immediately, real work in signIn */
  login: (email: string, password: string) => Promise<boolean>;
};
const AuthCtx = createContext<Ctx | null>(null);

function toAuthUser(u: User | null | undefined): AuthUser | null {
  if (!u) return null;
  const name = (u.user_metadata?.full_name as string) || (u.email?.split("@")[0] ?? "مستخدم");
  return { id: u.id, email: u.email ?? "", name };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Register listener first, then hydrate.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(toAuthUser(s?.user ?? null));
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(toAuthUser(data.session?.user ?? null));
      setReady(true);
    });
    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };
  const signUp = async (email: string, password: string, name?: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
        data: name ? { full_name: name } : undefined,
      },
    });
    return { error: error?.message ?? null };
  };
  const logout = async () => {
    await supabase.auth.signOut();
  };
  const updateName = async (name: string) => {
    await supabase.auth.updateUser({ data: { full_name: name } });
    setUser((u) => (u ? { ...u, name } : u));
  };
  const login = async (email: string, password: string) => {
    const { error } = await signIn(email, password);
    return !error;
  };

  return (
    <AuthCtx.Provider value={{ user, session, ready, signIn, signUp, logout, updateName, login }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const c = useContext(AuthCtx);
  if (!c) throw new Error("AuthProvider missing");
  return c;
}
