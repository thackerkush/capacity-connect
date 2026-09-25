'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import { Spinner } from './Spinner';

interface RouteGuardProps {
  children: React.ReactNode;
  allowedRoles?: string[];
}

/**
 * L-4: Fixed the "spinner-forever" and "spinner-during-redirect" UX bugs.
 *
 * Previous behavior:
 *  - The render condition checked `!user || !hasRole` AFTER the redirect was triggered.
 *    Because Next.js router.push() is async, the component still rendered the spinner
 *    for one frame (or longer) while the navigation completed — a visible flash.
 *
 * Fixed behavior:
 *  - A `redirecting` flag is set to true the moment we decide to redirect.
 *  - While redirecting, we render null (instant blank) instead of the spinner.
 *  - The spinner is only shown during the genuine loading phase (isLoading === true).
 *  - Once loaded: authorised users see their content immediately with no extra renders.
 */
export function RouteGuard({ children, allowedRoles }: RouteGuardProps) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [redirecting, setRedirecting] = useState(false);

  const hasRole =
    !allowedRoles ||
    allowedRoles.some((role) => user?.roles.includes(role)) ||
    user?.roles.includes('admin');

  useEffect(() => {
    if (isLoading) return;

    if (!user) {
      setRedirecting(true);
      router.push('/?auth=true');
    } else if (!hasRole) {
      setRedirecting(true);
      router.push('/');
    }
  }, [user, isLoading, hasRole, router]);

  // Still fetching auth state — show spinner
  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[calc(100vh-4rem)]">
        <Spinner size="lg" label="Verifying access..." />
      </div>
    );
  }

  // Redirect has been triggered — render nothing to avoid the spinner flash
  if (redirecting || !user || !hasRole) {
    return null;
  }

  return <>{children}</>;
}
