import { ClerkProvider } from "@clerk/react";

export function getClerkPublishableKey() {
  return import.meta.env.VITE_CLERK_PUBLISHABLE_KEY?.trim() ?? "";
}

export function MaybeClerkProvider({ children }: { children: React.ReactNode }) {
  const publishableKey = getClerkPublishableKey();

  if (!publishableKey) {
    return <>{children}</>;
  }

  return <ClerkProvider publishableKey={publishableKey}>{children}</ClerkProvider>;
}
