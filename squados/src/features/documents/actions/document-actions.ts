'use server';

import { createClient } from '@/shared/lib/supabase/server';

export interface DocumentFile {
  id: string;
  message_id: string;
  conversation_id: string;
  sender_id: string;
  sender_sector_id: string | null;
  file_name: string;
  file_size: number;
  mime_type: string;
  storage_path: string;
  created_at: string;
  sender_name?: string;
  sector_name?: string;
  group_name?: string;
  recipient_label?: string;
}

export interface DmDocumentGroup {
  sector_id: string | null;
  sector_name: string;
  files: DocumentFile[];
}

export interface GroupDocumentGroup {
  conversation_id: string;
  group_name: string;
  files: DocumentFile[];
}

export async function sendDocumentAction(params: {
  conversationId: string;
  messageId: string;
  storagePath: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Não autenticado' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('active_sector_id, sector_id')
    .eq('id', user.id)
    .single();

  const sectorId = profile?.active_sector_id ?? profile?.sector_id ?? null;

  const { error } = await supabase.from('document_files').insert({
    message_id: params.messageId,
    conversation_id: params.conversationId,
    sender_id: user.id,
    sender_sector_id: sectorId,
    file_name: params.fileName,
    file_size: params.fileSize,
    mime_type: params.mimeType,
    storage_path: params.storagePath,
  });

  if (error) return { error: error.message };
  return {};
}

export async function getMyDocumentsAction(): Promise<DmDocumentGroup[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('document_files')
    .select(`
      id, message_id, conversation_id, sender_id, sender_sector_id,
      file_name, file_size, mime_type, storage_path, created_at,
      sender:profiles!sender_id(full_name),
      sector:sectors!sender_sector_id(name),
      conversation:conversations!conversation_id(type)
    `)
    .neq('sender_id', user.id)
    .order('created_at', { ascending: false });

  if (error) { console.error('[getMyDocumentsAction]', error.message); return []; }
  if (!data) return [];

  const dmFiles = data.filter((d: any) => d.conversation?.type === 'dm');

  const grouped = new Map<string, DmDocumentGroup>();
  for (const d of dmFiles) {
    const key = d.sender_sector_id ?? 'sem-setor';
    const sectorName = (d.sector as any)?.name ?? 'Sem Setor';
    if (!grouped.has(key)) {
      grouped.set(key, { sector_id: d.sender_sector_id, sector_name: sectorName, files: [] });
    }
    grouped.get(key)!.files.push({
      ...d,
      sender_name: (d.sender as any)?.full_name ?? 'Usuário',
      sector_name: sectorName,
    });
  }

  return Array.from(grouped.values());
}

export async function getGroupDocumentsAction(): Promise<GroupDocumentGroup[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('document_files')
    .select(`
      id, message_id, conversation_id, sender_id, sender_sector_id,
      file_name, file_size, mime_type, storage_path, created_at,
      sender:profiles!sender_id(full_name),
      conversation:conversations!conversation_id(type, title)
    `)
    .order('created_at', { ascending: false });

  if (error) { console.error('[getGroupDocumentsAction]', error.message); return []; }
  if (!data) return [];

  const groupFiles = data.filter((d: any) => d.conversation?.type === 'group');

  const grouped = new Map<string, GroupDocumentGroup>();
  for (const d of groupFiles) {
    const key = d.conversation_id;
    const groupName = (d.conversation as any)?.title ?? 'Grupo';
    if (!grouped.has(key)) {
      grouped.set(key, { conversation_id: key, group_name: groupName, files: [] });
    }
    grouped.get(key)!.files.push({
      ...d,
      sender_name: (d.sender as any)?.full_name ?? 'Usuário',
      group_name: groupName,
    });
  }

  return Array.from(grouped.values());
}

export async function getSentDocumentsAction(): Promise<DocumentFile[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('document_files')
    .select(`
      id, message_id, conversation_id, sender_id, sender_sector_id,
      file_name, file_size, mime_type, storage_path, created_at,
      conversation:conversations!conversation_id(type, title, participant_ids)
    `)
    .eq('sender_id', user.id)
    .order('created_at', { ascending: false });

  if (error) { console.error('[getSentDocumentsAction]', error.message); return []; }
  if (!data) return [];

  return data.map((d: any) => {
    const conv = d.conversation as any;
    const recipientLabel = conv?.type === 'group'
      ? (conv?.title ?? 'Grupo')
      : 'Mensagem Direta';
    return {
      ...d,
      recipient_label: recipientLabel,
    };
  });
}

export async function getSignedDownloadUrlAction(storagePath: string): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase.storage
    .from('workspace-documents')
    .createSignedUrl(storagePath, 3600);

  return data?.signedUrl ?? null;
}
