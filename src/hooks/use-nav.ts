'use client';

import { useMemo } from 'react';
import type { NavItem, NavGroup } from '@/types';

/**
 * Hook to filter navigation items (no RBAC for now - using Supabase auth)
 */
export function useFilteredNavItems(items: NavItem[]) {
  return useMemo(() => items, [items]);
}

/**
 * Hook to filter navigation groups
 */
export function useFilteredNavGroups(groups: NavGroup[]) {
  return useMemo(() => groups, [groups]);
}
