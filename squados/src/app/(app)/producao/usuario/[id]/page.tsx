import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import { getTasksForUserAction } from '@/features/production/actions/task-actions';
import { TaskFlowSection } from '@/features/production/components/task-flow-section';
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
  return { title: data?.full_name ? `Tarefas — ${data.full_name}` : 'Tarefas' };
}

export default async function UserTaskPage({ params }: PageProps) {
  const { id } = await params;
  const { user, profile } = await getAuthenticatedUser();

  const isAdmin = profile.role === 'admin' || profile.role === 'master_admin';

  // Apenas o próprio usuário ou admin pode acessar
  if (!isAdmin && user.id !== id) redirect('/producao');

  const admin = createAdminClient();

  const [targetProfileResult, { tasks = [], completions = [], error }] = await Promise.all([
    admin.from('profiles').select('id, full_name, avatar_url, role, status').eq('id', id).single(),
    getTasksForUserAction(id),
  ]);

  if (!targetProfileResult.data || targetProfileResult.data.status !== 'active') {
    notFound();
  }

  if (error) redirect('/producao');

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
              {tasks.length} tarefa{tasks.length !== 1 ? 's' : ''} cadastrada{tasks.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </div>

      <div className="border-t border-border" />

      {/* Task flow */}
      <TaskFlowSection
        initialTasks={tasks}
        initialCompletions={completions}
        currentUserId={user.id}
        targetUserId={id}
        isAdmin={isAdmin}
        showAddButton
      />
    </div>
  );
}
