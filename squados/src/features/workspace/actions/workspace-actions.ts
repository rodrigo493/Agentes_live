'use server';

import { createClient } from '@/shared/lib/supabase/server';
import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { sendMessageSchema } from '@/shared/lib/validation/schemas';

export async function getOrCreateDMConversation(otherUserId: string) {
  const { user } = await getAuthenticatedUser();
  const supabase = await createClient();

  // Check if DM already exists between these two users
  const { data: existing } = await supabase
    .from('conversations')
    .select('*')
    .eq('type', 'dm')
    .contains('participant_ids', [user.id])
    .contains('participant_ids', [otherUserId]);

  const dm = existing?.find((c) =>
    c.participant_ids.length === 2 &&
    c.participant_ids.includes(user.id) &&
    c.participant_ids.includes(otherUserId)
  );

  if (dm) return { data: dm };

  // Create new DM conversation
  const { data, error } = await supabase
    .from('conversations')
    .insert({
      type: 'dm' as const,
      participant_ids: [user.id, otherUserId],
    })
    .select()
    .single();

  if (error) return { error: error.message };
  return { data };
}

export async function sendMessageAction(input: {
  conversation_id: string;
  content: string;
  content_type?: string;
  reply_to_id?: string;
}) {
  const { user } = await getAuthenticatedUser();
  const supabase = await createClient();

  const parsed = sendMessageSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: parsed.data.conversation_id,
      sender_id: user.id,
      sender_type: 'user' as const,
      content: parsed.data.content,
      content_type: parsed.data.content_type ?? 'text',
      reply_to_id: parsed.data.reply_to_id ?? null,
    })
    .select()
    .single();

  if (error) return { error: error.message };
  return { data };
}

export async function getMessagesAction(conversationId: string, limit = 50, before?: string) {
  await getAuthenticatedUser();
  const supabase = await createClient();

  let query = supabase
    .from('messages')
    .select('*, sender:profiles!sender_id(id, full_name, avatar_url, role)')
    .eq('conversation_id', conversationId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (before) {
    query = query.lt('created_at', before);
  }

  const { data, error } = await query;
  if (error) return { error: error.message, data: [] };
  return { data: data.reverse() };
}

export async function getConversationsAction() {
  const { user } = await getAuthenticatedUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .order('last_message_at', { ascending: false });

  if (error) return { error: error.message, data: [] };
  return { data };
}

export async function getContactsAction() {
  const { user } = await getAuthenticatedUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, avatar_url, role, status, sector_id, last_seen_at, sectors(name)')
    .eq('status', 'active')
    .is('deleted_at', null)
    .neq('id', user.id)
    .order('full_name');

  if (error) return { error: error.message, data: [] };
  return { data };
}
