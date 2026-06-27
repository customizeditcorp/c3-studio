'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';

interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  tenant_id: string | null;
  avatar_url: string | null;
}

interface UserContextValue {
  user: User | null;
  profile: UserProfile | null;
  tenantId: string | null;
  loading: boolean;
  profileMissing: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const UserContext = createContext<UserContextValue>({
  user: null,
  profile: null,
  tenantId: null,
  loading: true,
  profileMissing: false,
  refreshProfile: async () => {},
  signOut: async () => {}
});

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileMissing, setProfileMissing] = useState(false);
  const supabase = useMemo(() => createClient(), []);
  const isIntentionalSignOut = useRef(false);

  const fetchProfile = useCallback(
    async (
      userId: string,
      fallbackEmail?: string,
      fallbackName?: string | null
    ) => {
      const { data: profileData, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (profileData) {
        setProfile(profileData as UserProfile);
        setProfileMissing(false);
      } else {
        if (error) console.warn('users lookup failed for', userId, error);

        const { data: tenant } = await supabase
          .from('tenants')
          .select('id')
          .limit(1)
          .maybeSingle();

        if (tenant) {
          setProfile({
            id: userId,
            email: fallbackEmail || '',
            full_name: fallbackName || null,
            role: 'owner',
            tenant_id: tenant.id,
            avatar_url: null
          });
          setProfileMissing(false);
        } else {
          setProfile(null);
          setProfileMissing(true);
        }
      }
    },
    [supabase]
  );

  const refreshProfile = useCallback(async () => {
    const {
      data: { user: u }
    } = await supabase.auth.getUser();
    if (u)
      await fetchProfile(
        u.id,
        u.email,
        typeof u.user_metadata?.full_name === 'string'
          ? u.user_metadata.full_name
          : null
      );
  }, [supabase, fetchProfile]);

  useEffect(() => {
    let didFinish = false;

    const getUser = async () => {
      try {
        const {
          data: { session }
        } = await supabase.auth.getSession();
        const user = session?.user ?? null;
        setUser(user);

        if (user) {
          await fetchProfile(
            user.id,
            user.email,
            typeof user.user_metadata?.full_name === 'string'
              ? user.user_metadata.full_name
              : null
          );
        } else {
          // F-042: segunda línea de defensa client-side.
          // Si no hay sesión y la ruta no es pública, redirigir a /login.
          // Esta lista debe mantenerse idéntica a la de src/lib/supabase/middleware.ts.
          const publicPaths = [
            '/login',
            '/signup',
            '/auth/callback',
            '/preview/',
            '/api/preview-approve',
            '/api/preview-feedback'
          ];
          const currentPath = window.location.pathname;
          const isPublic = publicPaths.some((p) => currentPath.startsWith(p));
          if (!isPublic) {
            window.location.replace('/login');
            return;
          }
        }
      } catch (err) {
        console.error('Auth check failed:', err);
      } finally {
        didFinish = true;
        setLoading(false);
      }
    };

    void getUser();

    // Safety timeout: si auth check cuelga 8s, desbloquea el UI.
    // No detecta sesión expirada — ese path es onAuthStateChange SIGNED_OUT.
    const timeout = setTimeout(() => {
      if (!didFinish) {
        console.warn('Auth check timed out after 8s — unblocking UI');
        setLoading(false);
      }
    }, 8000);

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        if (isIntentionalSignOut.current) {
          isIntentionalSignOut.current = false;
          setUser(null);
          setProfile(null);
          setProfileMissing(false);
          setLoading(false);
          return;
        }
        // SIGNED_OUT durante init = error de red, no expiración real
        // SIGNED_OUT post-init = refresh token rechazado (400) → session_expired
        setUser(null);
        setProfile(null);
        setProfileMissing(false);
        setLoading(false);
        if (didFinish) {
          window.location.replace('/login?reason=session_expired');
        } else {
          window.location.replace('/login');
        }
        return;
      }

      setUser(session?.user ?? null);
      if (session?.user) {
        let handlerDidFinish = false;
        const handlerTimeout = new Promise<void>((resolve) => {
          setTimeout(() => {
            if (!handlerDidFinish) {
              console.warn(
                'onAuthStateChange fetchProfile timed out after 8s — unblocking UI'
              );
            }
            resolve();
          }, 8000);
        });
        await Promise.race([
          fetchProfile(
            session.user.id,
            session.user.email,
            typeof session.user.user_metadata?.full_name === 'string'
              ? session.user.user_metadata.full_name
              : null
          ).then(() => {
            handlerDidFinish = true;
          }),
          handlerTimeout
        ]);
      } else {
        setProfile(null);
        setProfileMissing(false);
      }
      setLoading(false);
    });

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, [fetchProfile, supabase]);

  const signOut = async () => {
    try {
      isIntentionalSignOut.current = true;
      const { error } = await supabase.auth.signOut();
      if (error) {
        isIntentionalSignOut.current = false;
        console.error('Error signing out:', error);
      }
    } finally {
      setUser(null);
      setProfile(null);
      setProfileMissing(false);
      setLoading(false);
    }
  };

  return (
    <UserContext.Provider
      value={{
        user,
        profile,
        tenantId: profile?.tenant_id ?? null,
        loading,
        profileMissing,
        refreshProfile,
        signOut
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
