'use client';

import React from 'react';
import { ActiveThemeProvider } from '../themes/active-theme';
import QueryProvider from './query-provider';
import { UserProvider } from '@/contexts/UserContext';

export default function Providers({
  activeThemeValue,
  children
}: {
  activeThemeValue: string;
  children: React.ReactNode;
}) {
  return (
    <ActiveThemeProvider initialTheme={activeThemeValue}>
      <QueryProvider>
        <UserProvider>{children}</UserProvider>
      </QueryProvider>
    </ActiveThemeProvider>
  );
}
