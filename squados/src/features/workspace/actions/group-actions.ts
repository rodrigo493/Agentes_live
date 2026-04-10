'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import { requirePermission } from '@/shared/lib/rbac/guards';
import { logAudit } from '@/features/audit/lib/audit-logger';

export async function updateGroupAction(
  groupId: string,
  data: { name?: string; description?: string | null; avatar_url?: string | null }
) {
  await requirePermission('groups', 'manage');

  const admin = createAdminClient();
  const { error } = await admin
    .from('groups')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', groupId);

  if (error) return { error: error.message };

  // Sync conversation title if name changed
  if (data.name) {
    await admin
      .from('conversations')
      .update({ title: data.name })
      .eq('group_id', groupId);
  }

  return { success: true };
}

export async function getGroupMembersAction(groupId: string) {
  await requirePermission('groups', 'read');

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('group_members')
    .select('user_id, role, joined_at, profiles!user_id(id, full_name, avatar_url, role)')
    .eq('group_id', groupId)
    .order('joined_at', { ascending: true });

  if (error) return { error: error.message, data: [] };
  return { data: data ?? [] };
}

export async function addGroupMemberAction(groupId: string, userId: string) {
  await requirePermission('groups', 'manage');

  const admin = createAdminClient();

  // Add to group_members
  const { error } = await admin
    .from('group_members')
    .insert({ group_id: groupId, user_id: userId, role: 'member' });

  if (error) return { error: error.message };

  // Add to conversation participant_ids
  const { data: conv } = await admin
    .from('conversations')
    .select('id, participant_ids')
    .eq('group_id', groupId)
    .single();

  if (conv && !conv.participant_ids.includes(userId)) {
    await admin
      .from('conversations')
      .update({ participant_ids: [...conv.participant_ids, userId] })
      .eq('id', conv.id);
  }

  return { success: true };
}

export async function removeGroupMemberAction(groupId: string, userId: string) {
  await requirePermission('groups', 'manage');

  const admin = createAdminClient();

  // Remove from group_members
  const { error } = await admin
    .from('group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', userId);

  if (error) return { error: error.message };

  // Remove from conversation participant_ids
  const { data: conv } = await admin
    .from('conversations')
    .select('id, participant_ids')
    .eq('group_id', groupId)
    .single();

  if (conv) {
    await admin
      .from('conversations')
      .update({
        participant_ids: conv.participant_ids.filter((id: string) => id !== userId),
      })
      .eq('id', conv.id);
  }

  return { success: true };
}

export async function deleteGroupAction(groupId: string) {
  const { user } = await requirePermission('groups', 'manage');

  const admin = createAdminClient();

  // Soft delete: marca como inactive para preservar historico de mensagens
  const { error } = await admin
    .from('groups')
    .update({ status: 'inactive', updated_at: new Date().toISOString() })
    .eq('id', groupId);

  if (error) return { error: error.message };

  // Tambem arquiva a conversation do grupo
  await admin
    .from('conversations')
    .update({ status: 'archived' })
    .eq('group_id', groupId);

  await logAudit({
    userId: user.id,
    action: 'delete',
    resourceType: 'group',
    resourceId: groupId,
    details: { soft_delete: true },
  });

  revalidatePath('/groups');
  revalidatePath('/workspace');
  return { success: true };
}
