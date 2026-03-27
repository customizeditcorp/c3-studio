'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';

interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  tenant_id: string;
  avatar_url: string | null;
}

interface UserContextValue {
  user: User | null;
  profile: UserProfile | null;
  tenantId: string | null;
  loading: boolean;
  profileMissing: boolean;
  signOut: () => Promise<void>;
}

const UserContext = createContext<UserContextValue>({
  user: null,
  profile: null,
  tenantId: null,
  loading: true,
  profileMissing: false,
  signOut: async () => {}
});

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileMissing, setProfileMissing] = useState(false);
  const supabase = createClient();

  const fetchProfile = async (userId: string) => {
    const { data: profileData, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (profileData) {
      setProfile(profileData);
      setProfileMissing(false);
    } else {
      // No profile row — try to get tenant from first tenant in DB as fallback
      const { data: tenant } = await supabase
        .from('tenants')
        .select('id')
        .limit(1)
        .maybeSingle();

      if (tenant) {
        // Create a minimal profile with the tenant_id so the app works
        setProfile({
          id: userId,
          email: '',
          full_name: null,
          role: 'operator',
          tenant_id: tenant.id,
          avatar_url: null
        });
        setProfileMissing(false);
      } else {
        setProfileMissing(true);
        console.warn('No profile or tenant found for user', userId, error);
      }
    }
  };

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      if (user) await fetchProfile(user.id);
      setLoading(false);
    };

    getUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchProfile(session.user.id);
      } else {
        setProfile(null);
        setProfileMissing(false);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  };

  return (
    <UserContext.Provider
      value={{
        user,
        profile,
        tenantId: profile?.tenant_id ?? null,
        loading,
        profileMissing,
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
