'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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

  const fetchProfile = useCallback(
    async (userId: string, fallbackEmail?: string, fallbackName?: string | null) => {
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
    const getUser = async () => {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      setUser(user);
      if (user)
        await fetchProfile(
          user.id,
          user.email,
          typeof user.user_metadata?.full_name === 'string'
            ? user.user_metadata.full_name
            : null
        );
      setLoading(false);
    };

    void getUser();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchProfile(
          session.user.id,
          session.user.email,
          typeof session.user.user_metadata?.full_name === 'string'
            ? session.user.user_metadata.full_name
            : null
        );
      } else {
        setProfile(null);
        setProfileMissing(false);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile, supabase]);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setProfileMissing(false);
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
