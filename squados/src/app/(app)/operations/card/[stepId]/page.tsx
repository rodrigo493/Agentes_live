import { notFound } from 'next/navigation';
import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { getCardDetailAction } from '@/features/workflows/actions/card-detail-actions';
import { getWorkflowAttachmentsAction } from '@/features/workflows/actions/workflow-attachment-actions';
import { CardDetailShell } from '@/features/workflows/components/card-detail-shell';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ stepId: string }>;
}

export default async function CardDetailPage({ params }: Props) {
  const { stepId } = await params;
  const { user, profile } = await getAuthenticatedUser();
  const isAdmin = profile.role === 'admin' || profile.role === 'master_admin';

  const { data, error } = await getCardDetailAction(stepId);
  if (error || !data) return notFound();

  const attachments = await getWorkflowAttachmentsAction(data.instance_id);

  return (
    <CardDetailShell
      detail={data}
      attachments={attachments}
      currentUserId={user.id}
      isAdmin={isAdmin}
    />
  );
}
