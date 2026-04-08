'use server';

import { createClient } from '@/shared/lib/supabase/server';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import { requirePermission, getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createGroupSchema } from '@/shared/lib/validation/schemas';
import { logAudit } from '@/features/audit/lib/audit-logger';

export async function createGroupAction(formData: FormData) {
  const { user } = await requirePermission('groups', 'write');

  const raw = {
    name: formData.get('name') as string,
    description: formData.get('description') as string || null,
    sector_id: formData.get('sector_id') as string || null,
    member_ids: JSON.parse(formData.get('member_ids') as string || '[]'),
  };

  const parsed = createGroupSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const adminClient = createAdminClient();

  // Create group
  const { data: group, error } = await adminClient
    .from('groups')
    .insert({
      name: parsed.data.name,
      description: parsed.data.description,
      sector_id: parsed.data.sector_id,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) return { error: error.message };

  // Add creator as admin member
  const members = [
    { group_id: group.id, user_id: user.id, role: 'admin' as const, added_by: user.id },
    ...parsed.data.member_ids
      .filter((id: string) => id !== user.id)
      .map((id: string) => ({
        group_id: group.id,
        user_id: id,
        role: 'member' as const,
        added_by: user.id,
      })),
  ];

  await adminClient.from('group_members').insert(members);

  // Create group conversation
  const allMemberIds = [user.id, ...parsed.data.member_ids.filter((id: string) => id !== user.id)];
  await adminClient.from('conversations').insert({
    type: 'group' as const,
    group_id: group.id,
    sector_id: parsed.data.sector_id,
    participant_ids: allMemberIds,
    title: parsed.data.name,
  });

  await logAudit({
    userId: user.id,
    action: 'group_create',
    resourceType: 'group',
    resourceId: group.id,
    details: { name: parsed.data.name, member_count: allMemberIds.length },
  });

  return { success: true, data: group };
}

export async function addGroupMemberAction(groupId: string, memberId: string) {
  const { user } = await requirePermission('groups', 'manage');
  const adminClient = createAdminClient();

  const { error } = await adminClient.from('group_members').insert({
    group_id: groupId,
    user_id: memberId,
    role: 'member' as const,
    added_by: user.id,
  });

  if (error) {
    if (error.code === '23505') return { error: 'Usuário já é membro do grupo' };
    return { error: error.message };
  }

  // Update conversation participant_ids
  const { data: conv } = await adminClient
    .from('conversations')
    .select('id, participant_ids')
    .eq('group_id', groupId)
    .eq('type', 'group')
    .single();

  if (conv && !conv.participant_ids.includes(memberId)) {
    await adminClient
      .from('conversations')
      .update({ participant_ids: [...conv.participant_ids, memberId] })
      .eq('id', conv.id);
  }

  await logAudit({
    userId: user.id,
    action: 'group_member_add',
    resourceType: 'group',
    resourceId: groupId,
    details: { member_id: memberId },
  });

  return { success: true };
}

export async function removeGroupMemberAction(groupId: string, memberId: string) {
  const { user } = await requirePermission('groups', 'manage');
  const adminClient = createAdminClient();

  const { error } = await adminClient
    .from('group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', memberId);

  if (error) return { error: error.message };

  await logAudit({
    userId: user.id,
    action: 'group_member_remove',
    resourceType: 'group',
    resourceId: groupId,
    details: { member_id: memberId },
  });

  return { success: true };
}

export async function listGroupsAction() {
  await getAuthenticatedUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('groups')
    .select('*, sectors(name, slug), group_members(user_id, role)')
    .eq('status', 'active')
    .order('name');

  if (error) return { error: error.message, data: [] };
  return { data };
}
