import type { ReaderDocument } from "@/lib/pdf";
import { App } from "@/app";
import { MaybeClerkProvider } from "@/lib/clerk-provider";

export function AppShell({ initialDocument }: { initialDocument: ReaderDocument | null }) {
  return (
    <MaybeClerkProvider>
      <App initialDocument={initialDocument} />
    </MaybeClerkProvider>
  );
}
