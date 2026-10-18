'use client';

import { SignIn, SignUp, useClerk, useUser } from '@clerk/nextjs';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';

const appearance = {
  variables: {
    colorPrimary: '#087f70',
    colorForeground: '#173c38',
    colorBackground: '#ffffff',
    colorMutedForeground: '#71817f',
    borderRadius: '1rem',
    fontFamily: "'DM Sans', Arial, sans-serif",
  },
  elements: {
    rootBox: 'w-full', cardBox: 'w-full shadow-none',
    card: 'w-full border-0 bg-transparent p-0 shadow-none', header: 'hidden',
    formButtonPrimary: 'h-12 rounded-2xl bg-[#087f70] text-sm font-bold shadow-none hover:bg-[#066b5f]',
    formFieldInput: 'h-12 rounded-2xl border-[#dce8e3] shadow-none',
    formFieldLabel: 'text-sm font-bold text-[#294b4c]', footer: 'pt-5',
  },
};

export function CleanerClerkSignUp({ mode }: { mode: 'sign_in' | 'sign_up' }) {
  const { isLoaded, isSignedIn } = useUser();
  const clerk = useClerk();

  if (isLoaded && isSignedIn) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm font-bold text-amber-950">You are already signed in</p>
        <p className="mt-2 text-sm leading-6 text-amber-800">
          Sign out of the current account, then continue with the email address
          that received this cleaner invitation.
        </p>
        <Button
          type="button"
          className="mt-4 h-12 w-full rounded-2xl"
          onClick={() => void clerk.signOut({ redirectUrl: window.location.href })}
        >
          <LogOut /> Sign out and continue
        </Button>
      </div>
    );
  }

  if (mode === 'sign_in') {
    return (
      <SignIn
        path="/cleaner-invitation"
        routing="path"
        forceRedirectUrl="/cleaner-invitation-complete"
        signUpUrl="/cleaner-invitation"
        appearance={appearance}
      />
    );
  }

  return (
    <SignUp
      path="/cleaner-invitation"
      routing="path"
      forceRedirectUrl="/cleaner-invitation-complete"
      signInUrl="/sign-in"
      appearance={appearance}
    />
  );
}
