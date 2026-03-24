import { SignInButton, SignOutButton } from "@clerk/react";

import { getClerkPublishableKey } from "@/lib/clerk-provider";
import type { LineaManagedAccessSnapshot } from "@/lib/linea-access";

function getSignedInLabel(snapshot: LineaManagedAccessSnapshot) {
  if (snapshot.user?.firstName?.trim()) {
    return snapshot.user.firstName.trim();
  }

  if (snapshot.user?.email) {
    return snapshot.user.email;
  }

  return "Signed in";
}

function currentUrl() {
  return typeof window !== "undefined" ? window.location.href : "/";
}

export function ClerkAccessControls({
  snapshot,
  compact = false,
}: {
  snapshot: LineaManagedAccessSnapshot;
  compact?: boolean;
}) {
  if (!getClerkPublishableKey()) {
    return null;
  }

  if (!snapshot.enabled && !snapshot.user) {
    return null;
  }

  const buttonClassName = compact ? "linea-btn-ghost linea-btn-icon" : "linea-btn-secondary";

  if (snapshot.user) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: compact ? 8 : 12,
        }}
      >
        {!compact ? (
          <span className="linea-panel-label" style={{ whiteSpace: "nowrap" }}>
            {getSignedInLabel(snapshot)}
          </span>
        ) : null}
        <SignOutButton redirectUrl={currentUrl()}>
          <button type="button" className={buttonClassName}>
            Sign out
          </button>
        </SignOutButton>
      </div>
    );
  }

  return (
    <SignInButton>
      <button type="button" className={buttonClassName}>
        Sign in
      </button>
    </SignInButton>
  );
}
