'use server';

import { createClient } from '@/shared/lib/supabase/server';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import { requirePermission, getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createSectorSchema } from '@/shared/lib/validation/schemas';
import { logAudit } from '@/features/audit/lib/audit-logger';

export async function listSectorsAction() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('sectors')
    .select('*, agents(name, display_name, status)')
    .eq('is_active', true)
    .order('name');

  if (error) return { error: error.message, data: [] };
  return { data };
}

export async function createSectorAction(formData: FormData) {
  const { user } = await requirePermission('sectors', 'write');

  const raw = {
    name: formData.get('name') as string,
    slug: formData.get('slug') as string,
    description: formData.get('description') as string || null,
    area: formData.get('area') as string || null,
    icon: formData.get('icon') as string || null,
  };

  const parsed = createSectorSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from('sectors')
    .insert(parsed.data)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') return { error: 'Slug já existe' };
    return { error: error.message };
  }

  await logAudit({
    userId: user.id,
    action: 'create',
    resourceType: 'sector',
    resourceId: data.id,
    details: { name: parsed.data.name, slug: parsed.data.slug },
  });

  return { success: true, data };
}

export async function getSectorBySlugAction(slug: string) {
  await getAuthenticatedUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('sectors')
    .select('*, agents(name, display_name, status)')
    .eq('slug', slug)
    .eq('is_active', true)
    .single();

  if (error) return { error: error.message };
  return { data };
}
