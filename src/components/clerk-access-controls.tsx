import { SignInButton, SignOutButton } from "@clerk/react";
import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

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

function getShortSignedInLabel(snapshot: LineaManagedAccessSnapshot) {
  if (snapshot.user?.firstName?.trim()) {
    return snapshot.user.firstName.trim();
  }

  if (snapshot.user?.email) {
    return snapshot.user.email.split("@")[0] ?? snapshot.user.email;
  }

  return "Account";
}

function getAccountInitials(snapshot: LineaManagedAccessSnapshot) {
  const base =
    snapshot.user?.firstName?.trim() ||
    snapshot.user?.email?.split("@")[0] ||
    "LI";

  const tokens = base
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2);

  if (tokens.length === 0) {
    return "LI";
  }

  return tokens.map((token) => token[0]?.toUpperCase() ?? "").join("");
}

function getAccountStatusLabel(snapshot: LineaManagedAccessSnapshot) {
  if (snapshot.access.role === "owner") {
    return "Owner access";
  }

  if (snapshot.access.role === "gifted") {
    return "Shared access";
  }

  if (snapshot.access.status === "blocked") {
    return "Needs approval";
  }

  return "Signed in";
}

function currentUrl() {
  return typeof window !== "undefined" ? window.location.href : "/";
}

function useStableRedirectUrl() {
  const [redirectUrl, setRedirectUrl] = useState("/");

  useEffect(() => {
    setRedirectUrl(currentUrl());
  }, []);

  return redirectUrl;
}

export function ClerkAccessControls({
  snapshot,
  compact = false,
}: {
  snapshot: LineaManagedAccessSnapshot;
  compact?: boolean;
}) {
  const redirectUrl = useStableRedirectUrl();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [menuOpen]);

  if (!getClerkPublishableKey()) {
    return null;
  }

  if (!snapshot.enabled && !snapshot.user) {
    return null;
  }

  const buttonClassName = compact ? "linea-btn-secondary" : "linea-btn-secondary";

  if (snapshot.user) {
    if (compact) {
      return (
        <div ref={menuRef} className="linea-account-shell">
          <button
            type="button"
            className={`linea-account-chip${menuOpen ? " open" : ""}`}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            onClick={() => setMenuOpen((current) => !current)}
          >
            <span className="linea-account-avatar">{getAccountInitials(snapshot)}</span>
            <span className="linea-account-copy">
              <span className="linea-account-name">{getShortSignedInLabel(snapshot)}</span>
              <span className="linea-account-role">{getAccountStatusLabel(snapshot)}</span>
            </span>
            <ChevronDown size={14} className="linea-account-caret" />
          </button>

          {menuOpen ? (
            <div className="linea-header-popover linea-account-menu" role="menu">
              <div className="linea-account-menu-header">
                <div className="linea-account-menu-avatar">{getAccountInitials(snapshot)}</div>
                <div className="linea-account-menu-copy">
                  <div className="linea-account-menu-name">{getSignedInLabel(snapshot)}</div>
                  <div className="linea-account-menu-email">
                    {snapshot.user.email ?? "Signed-in account"}
                  </div>
                </div>
              </div>

              <div className="linea-account-status">{getAccountStatusLabel(snapshot)}</div>

              <p className="linea-account-menu-note">
                {snapshot.access.status === "blocked"
                  ? "This account is signed in, but managed access still needs approval."
                  : "Shared voice stays server-managed on this deployment, so provider keys remain off the client."}
              </p>

              <SignOutButton redirectUrl={redirectUrl}>
                <button type="button" className="linea-btn-secondary linea-account-signout">
                  Sign out
                </button>
              </SignOutButton>
            </div>
          ) : null}
        </div>
      );
    }

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
        <SignOutButton redirectUrl={redirectUrl}>
          <button type="button" className={buttonClassName}>
            Sign out
          </button>
        </SignOutButton>
      </div>
    );
  }

  return (
    <SignInButton
      mode="redirect"
      forceRedirectUrl={redirectUrl}
      fallbackRedirectUrl={redirectUrl}
    >
      <button type="button" className={buttonClassName}>
        Sign in
      </button>
    </SignInButton>
  );
}
