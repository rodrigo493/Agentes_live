import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import { getTasksForUserAction } from '@/features/production/actions/task-actions';
import { getProductionDataAction } from '@/features/production/actions/production-actions';
import { ProductionShell } from '@/features/production/components/production-shell';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft } from 'lucide-react';

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  const admin = createAdminClient();
  const { data } = await admin.from('profiles').select('full_name').eq('id', id).single();
  return { title: data?.full_name ? `Produção — ${data.full_name}` : 'Produção' };
}

export default async function UserProductionPage({ params }: PageProps) {
  const { id } = await params;
  const { user, profile } = await getAuthenticatedUser();

  const isAdmin = profile.role === 'admin' || profile.role === 'master_admin';

  if (!isAdmin && user.id !== id) redirect('/producao');

  const admin = createAdminClient();

  const [
    targetProfileResult,
    { tasks = [], completions = [] },
    { processes = [], media = [] },
  ] = await Promise.all([
    admin.from('profiles').select('id, full_name, avatar_url, role, status').eq('id', id).single(),
    getTasksForUserAction(id),
    getProductionDataAction(id),
  ]);

  if (!targetProfileResult.data || targetProfileResult.data.status !== 'active') {
    notFound();
  }

  const targetProfile = targetProfileResult.data;

  function getInitials(name: string) {
    return name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-full">
      {/* Back + Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/producao"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Produção
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <Avatar className="h-12 w-12">
          {targetProfile.avatar_url && (
            <AvatarImage src={targetProfile.avatar_url} alt={targetProfile.full_name} />
          )}
          <AvatarFallback className="text-sm bg-primary/10 text-primary">
            {getInitials(targetProfile.full_name)}
          </AvatarFallback>
        </Avatar>
        <div>
          <h1 className="text-xl font-bold">{targetProfile.full_name}</h1>
          <div className="flex items-center gap-2 mt-0.5">
            <Badge variant="secondary" className="text-[10px] capitalize">
              {targetProfile.role.replace('_', ' ')}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {processes.length} processo{processes.length !== 1 ? 's' : ''} ·{' '}
              {tasks.length} tarefa{tasks.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </div>

      <div className="border-t border-border" />

      {/* Shell sem calendário e sem grid de usuários */}
      <ProductionShell
        initialProcesses={processes}
        initialMedia={media}
        initialTasks={tasks}
        initialCompletions={completions}
        currentUserId={user.id}
        targetUserId={id}
        contacts={[]}
        isAdmin={isAdmin}
        initialCalendarEvents={[]}
        googleConnected={false}
        googleEmail={null}
        googleConfigured={false}
        showCalendar={false}
        showUserGrid={false}
      />
    </div>
  );
}
