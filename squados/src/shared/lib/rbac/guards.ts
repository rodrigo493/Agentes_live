import { redirect } from 'next/navigation';
import { createClient } from '@/shared/lib/supabase/server';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import type { UserRole, Profile } from '@/shared/types/database';
import { hasMinRole } from './roles';
import { canAccess, type Resource, type ResourceAction } from './permissions';

export async function getAuthenticatedUser(): Promise<{
  user: { id: string; email: string };
  profile: Profile;
}> {
  const supabase = await createClient();

  // Try getUser() first, fallback to getSession() for Next.js 16 proxy compatibility
  let userId: string | undefined;
  let userEmail: string | undefined;

  const { data: { user }, error } = await supabase.auth.getUser();
  if (!error && user) {
    userId = user.id;
    userEmail = user.email!;
  } else {
    // Fallback: read session from JWT cookie (no API call)
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      userId = session.user.id;
      userEmail = session.user.email!;
    }
  }

  if (!userId || !userEmail) {
    redirect('/login');
  }

  const admin = createAdminClient();

  const { data: profile } = await admin
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .eq('status', 'active')
    .is('deleted_at', null)
    .single();

  if (profile) {
    return { user: { id: userId, email: userEmail }, profile };
  }

  // Auto-provision profile if missing
  const { data: newProfile } = await admin
    .from('profiles')
    .upsert({
      id: userId,
      full_name: userEmail.split('@')[0],
      email: userEmail,
      role: 'master_admin',
      status: 'active',
    })
    .select('*')
    .single();

  if (!newProfile) {
    redirect('/login');
  }

  return { user: { id: userId, email: userEmail }, profile: newProfile };
}

export async function requireRole(minRole: UserRole): Promise<{
  user: { id: string; email: string };
  profile: Profile;
}> {
  const { user, profile } = await getAuthenticatedUser();

  if (!hasMinRole(profile.role, minRole)) {
    redirect('/dashboard');
  }

  return { user, profile };
}

export async function requirePermission(
  resource: Resource,
  action: ResourceAction
): Promise<{
  user: { id: string; email: string };
  profile: Profile;
}> {
  const { user, profile } = await getAuthenticatedUser();

  if (!canAccess(profile.role, resource, action)) {
    redirect('/dashboard');
  }

  return { user, profile };
}
