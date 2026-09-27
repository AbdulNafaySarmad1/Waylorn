'use client';

import { ErrorState } from '@/components/ui/States';
import { Button } from '@/components/ui/Button';
import { PageBody } from '@/components/ui/Layout';

/** Route-level error boundary: keeps the shell (navigation, context) usable. */
export default function OrgError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <PageBody>
      <ErrorState
        problem={{
          title: 'This view failed to load',
          message:
            'The control plane may be unreachable or returned an unexpected response. Other views and site operations are unaffected.',
          action: 'retry',
          correlationId: error.digest,
        }}
      >
        <div>
          <Button onClick={reset}>Retry</Button>
        </div>
      </ErrorState>
    </PageBody>
  );
}
