import { PageBody } from '@/components/ui/Layout';
import { EmptyState } from '@/components/ui/States';

export default function OrgNotFound() {
  return (
    <PageBody>
      <EmptyState title="Not found in this organization">
        The resource does not exist or is outside your scope. Check that you are in the intended organization.
      </EmptyState>
    </PageBody>
  );
}
