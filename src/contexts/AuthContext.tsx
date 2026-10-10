import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  currentUser,
  login,
  logout as authLogout,
  register,
  updateProfile,
  type PublicAccount,
} from '../services/auth';

interface AuthContextValue {
  user: PublicAccount | null;
  login: (email: string, password: string) => Promise<PublicAccount>;
  register: (email: string, password: string, name: string) => Promise<PublicAccount>;
  logout: () => void;
  rename: (name: string) => Promise<void>;
  refresh: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicAccount | null>(() => currentUser());

  const refresh = useCallback(() => setUser(currentUser()), []);

  useEffect(() => {
    // A second tab signing in/out should not leave a stale avatar behind.
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'dannz.session') refresh();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [refresh]);

  const signIn = useCallback(async (email: string, password: string) => {
    const account = await login(email, password);
    setUser(account);
    return account;
  }, []);

  const signUp = useCallback(
    async (email: string, password: string, name: string) => {
      const account = await register(email, password, name);
      setUser(account);
      return account;
    },
    []
  );

  const signOut = useCallback(() => {
    authLogout();
    setUser(null);
  }, []);

  const rename = useCallback(async (name: string) => {
    const updated = await updateProfile({ name });
    if (updated) setUser(updated);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      login: signIn,
      register: signUp,
      logout: signOut,
      rename,
      refresh,
    }),
    [user, signIn, signUp, signOut, rename, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}