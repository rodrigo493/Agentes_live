'use server';

import { createAdminClient } from '@/shared/lib/supabase/admin';
import { createClient } from '@/shared/lib/supabase/server';
import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';

export interface WorkflowAttachment {
  id: string;
  instance_id: string;
  step_id: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  storage_path: string;
  uploaded_by: string;
  uploaded_at: string;
  decision: 'seguir' | 'nao_seguir' | null;
  decided_by: string | null;
  decided_at: string | null;
  uploader_name?: string;
  step_title?: string;
  decider_name?: string;
}

export async function uploadWorkflowAttachmentAction(params: {
  instanceId: string;
  stepId: string;
  storagePath: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}): Promise<{ error?: string }> {
  const { user } = await getAuthenticatedUser();

  const admin = createAdminClient();
  const { error } = await admin.from('workflow_step_attachments').insert({
    instance_id: params.instanceId,
    step_id: params.stepId,
    file_name: params.fileName,
    file_size: params.fileSize,
    mime_type: params.mimeType,
    storage_path: params.storagePath,
    uploaded_by: user.id,
  });

  if (error) return { error: error.message };
  return {};
}

export async function getWorkflowAttachmentsAction(
  instanceId: string
): Promise<WorkflowAttachment[]> {
  const { user } = await getAuthenticatedUser();

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('workflow_step_attachments')
    .select(`
      id, instance_id, step_id, file_name, file_size, mime_type,
      storage_path, uploaded_by, uploaded_at, decision, decided_by, decided_at,
      uploader:profiles!uploaded_by(full_name),
      decider:profiles!decided_by(full_name),
      step:workflow_steps!step_id(
        template_step:workflow_template_steps!workflow_steps_template_step_id_fkey(title)
      )
    `)
    .eq('instance_id', instanceId)
    .order('uploaded_at', { ascending: true });

  if (error) { console.error('[getWorkflowAttachmentsAction]', error.message); return []; }
  if (!data) return [];

  return data.map((d: any) => {
    const step = Array.isArray(d.step) ? d.step[0] : d.step;
    const tplStep = step
      ? (Array.isArray(step.template_step) ? step.template_step[0] : step.template_step)
      : null;
    return {
      id: d.id,
      instance_id: d.instance_id,
      step_id: d.step_id,
      file_name: d.file_name,
      file_size: d.file_size,
      mime_type: d.mime_type,
      storage_path: d.storage_path,
      uploaded_by: d.uploaded_by,
      uploaded_at: d.uploaded_at,
      decision: d.decision ?? null,
      decided_by: d.decided_by ?? null,
      decided_at: d.decided_at ?? null,
      uploader_name: (Array.isArray(d.uploader) ? d.uploader[0] : d.uploader)?.full_name ?? 'Usuário',
      step_title: tplStep?.title ?? 'Etapa',
      decider_name: d.decided_by
        ? ((Array.isArray(d.decider) ? d.decider[0] : d.decider)?.full_name ?? 'Usuário')
        : undefined,
    } satisfies WorkflowAttachment;
  });
}

export async function decideWorkflowAttachmentAction(
  attachmentId: string,
  decision: 'seguir' | 'nao_seguir'
): Promise<{ error?: string }> {
  const { user } = await getAuthenticatedUser();

  const admin = createAdminClient();

  // Atomic update: only update if decision is still null
  const { error, data } = await admin
    .from('workflow_step_attachments')
    .update({
      decision,
      decided_by: user.id,
      decided_at: new Date().toISOString(),
    })
    .eq('id', attachmentId)
    .is('decision', null)
    .select('id');

  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: 'Decisão já registrada' };
  return {};
}

export async function getSignedAttachmentUrlAction(
  storagePath: string
): Promise<string | null> {
  await getAuthenticatedUser();

  const admin = createAdminClient();
  const { data: row } = await admin
    .from('workflow_step_attachments')
    .select('id')
    .eq('storage_path', storagePath)
    .single();

  if (!row) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from('workflow-attachments')
    .createSignedUrl(storagePath, 3600);

  if (error) return null;
  return data?.signedUrl ?? null;
}
