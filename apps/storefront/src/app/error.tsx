"use client";

import { Button, ErrorState } from "@lootvault/web-shared/ui";

export default function StorefrontError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <ErrorState
      message="We could not load this page. The marketplace may be briefly unavailable."
      action={<Button variant="outline" onClick={() => retry()}>Try again</Button>}
    />
  );
}
