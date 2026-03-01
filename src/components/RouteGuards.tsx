import { ReactNode, useEffect, useState } from "react";
import { RedirectToSignIn, SignedIn, SignedOut, useUser } from "@clerk/clerk-react";
import { Navigate, useLocation } from "react-router-dom";
import { AccessDenied } from "./AccessDenied";
import { fetchLiveWindowStatus, getRegisteredGuest } from "../lib/liveAccess";

type GuardProps = {
  children: ReactNode;
};

type PublicMetadata = {
  role?: string;
  isPaid?: boolean;
  plan?: string;
};

export function ProtectedRoute({ children }: GuardProps) {
  return (
    <>
      <SignedIn>{children}</SignedIn>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </>
  );
}

export function AdminRoute({ children }: GuardProps) {
  const { isLoaded, user } = useUser();

  if (!isLoaded) {
    return null;
  }

  const metadata = user?.publicMetadata as PublicMetadata | undefined;
  const isAdmin = metadata?.role === "admin";

  if (!isAdmin) {
    return <AccessDenied message="You need admin permissions to view this page." />;
  }

  return <>{children}</>;
}

export function PaidRoute({ children }: GuardProps) {
  const { isLoaded, user } = useUser();

  if (!isLoaded) {
    return null;
  }

  const metadata = user?.publicMetadata as PublicMetadata | undefined;
  const hasPaidAccess =
    metadata?.isPaid === true || metadata?.plan === "pro" || metadata?.plan === "premium";

  if (!hasPaidAccess) {
    return <AccessDenied title="Upgrade required" message="This page is available on paid plans only." />;
  }

  return <>{children}</>;
}

export function PrivateMetricsRoute({ children }: GuardProps) {
  const { isLoaded, user } = useUser();

  if (!isLoaded) {
    return null;
  }

  const allowedEmails = String(import.meta.env.VITE_LOT_DECODER_ACCESS_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  const allowedUserIds = String(import.meta.env.VITE_LOT_DECODER_ACCESS_USER_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const userEmail = user?.primaryEmailAddress?.emailAddress?.toLowerCase() ?? "";
  const userId = user?.id ?? "";

  const isAllowedByEmail = allowedEmails.includes(userEmail);
  const isAllowedByUserId = allowedUserIds.includes(userId);
  const isAllowed = isAllowedByEmail || isAllowedByUserId;

  if (!isAllowed) {
    return <AccessDenied title="Not found" message="This page is unavailable." />;
  }

  return <>{children}</>;
}

export function LiveShoppingAccessRoute({ children }: GuardProps) {
  const location = useLocation();
  const registeredGuest = getRegisteredGuest();
  const [isWindowOpen, setIsWindowOpen] = useState<boolean | null>(null);

  useEffect(() => {
    let isMounted = true;

    void fetchLiveWindowStatus()
      .then((status) => {
        if (!isMounted) {
          return;
        }

        setIsWindowOpen(status.is_window_open);
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }

        setIsWindowOpen(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  if (!registeredGuest) {
    return <Navigate to="/grtw?reason=register" replace state={{ from: location.pathname }} />;
  }

  if (isWindowOpen === null) {
    return null;
  }

  if (!isWindowOpen) {
    return <Navigate to="/grtw?reason=wait" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
