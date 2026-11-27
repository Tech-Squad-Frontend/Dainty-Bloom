'use client';

import type { ReactNode } from 'react';
import { AuthProvider } from './AuthProvider';
import { QueryProvider } from './QueryProvider';
import { ToastProvider } from '@/components/ui';
import { RouteFocusManager } from '@/components/layout/RouteFocusManager';
import { DismissKeyboardOnOutsideTap } from './DismissKeyboardOnOutsideTap';

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <AuthProvider>
        <ToastProvider>
          <RouteFocusManager />
          <DismissKeyboardOnOutsideTap />
          {children}
        </ToastProvider>
      </AuthProvider>
    </QueryProvider>
  );
}
