'use client';

import { SignUp } from '@clerk/nextjs';

export function BrandedClerkSignUp() {
  return (
    <SignUp
      path="/accept-invitation"
      routing="path"
      forceRedirectUrl="/admin-invitation-complete"
      signInUrl="/sign-in"
      appearance={{
        variables: {
          colorPrimary: '#007c70',
          colorForeground: '#183e3b',
          colorBackground: '#ffffff',
          colorMutedForeground: '#637571',
          borderRadius: '0.75rem',
          fontFamily: "'DM Sans', Arial, sans-serif",
        },
        elements: {
          rootBox: 'w-full',
          cardBox: 'w-full shadow-none',
          card: 'w-full border-0 bg-transparent p-0 shadow-none',
          header: 'hidden',
          footer: 'pt-5',
          formButtonPrimary:
            'h-11 bg-[#007c70] text-sm font-bold shadow-none hover:bg-[#00685d]',
          formFieldInput:
            'h-11 border-[#dce8e3] bg-white text-[#183e3b] shadow-none focus:border-[#007c70] focus:ring-[#68b9a8]',
          formFieldLabel: 'text-sm font-bold text-[#294b4c]',
          identityPreview: 'border-[#dce8e3] bg-[#f3f8f6]',
          formFieldAction: 'text-[#007c70] hover:text-[#00685d]',
          otpCodeFieldInput: 'border-[#dce8e3] text-[#183e3b]',
        },
      }}
    />
  );
}
