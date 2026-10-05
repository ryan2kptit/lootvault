"use client";

import { Button, ErrorState } from "@lootvault/web-shared/ui";

export default function StudioError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorState message={error.message} action={<Button variant="outline" onClick={() => retry()}>Try again</Button>} />;
}
