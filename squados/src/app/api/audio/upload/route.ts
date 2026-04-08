import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import { logAudit } from '@/features/audit/lib/audit-logger';

/**
 * POST /api/audio/upload
 *
 * Recebe áudio de dispositivos de captura na fábrica.
 * Autentica via device_token no header Authorization.
 * Aceita multipart (audio file) ou JSON (texto mockado para testes).
 *
 * Preparado para integração futura com ERP (Nomus), CNC, câmeras.
 */
export async function POST(req: NextRequest) {
  const admin = createAdminClient();

  // 1. Autenticação via device_token
  const authHeader = req.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');

  if (!token) {
    return NextResponse.json({ error: 'Token de dispositivo ausente' }, { status: 401 });
  }

  const { data: receiver, error: recvErr } = await admin
    .from('audio_receivers')
    .select('id, sector_id, name, status, config, is_active, sectors(name)')
    .eq('device_token', token)
    .single();

  if (recvErr || !receiver) {
    return NextResponse.json({ error: 'Dispositivo não autorizado' }, { status: 401 });
  }

  if (!receiver.is_active || receiver.status !== 'active') {
    return NextResponse.json({ error: 'Dispositivo inativo ou em manutenção' }, { status: 403 });
  }

  // 2. Buscar config LGPD do setor (ou global)
  const { data: lgpdConfig } = await admin
    .from('audio_lgpd_config')
    .select('retention_days')
    .or(`sector_id.eq.${receiver.sector_id},sector_id.is.null`)
    .order('sector_id', { ascending: false, nullsFirst: false })
    .limit(1)
    .single();

  const retentionDays = lgpdConfig?.retention_days ?? 30;
  const retentionDate = new Date();
  retentionDate.setDate(retentionDate.getDate() + retentionDays);

  // 3. Processar payload (multipart audio ou JSON mock)
  const contentType = req.headers.get('content-type') ?? '';
  let storagePath = '';
  let fileSize = 0;
  let durationSeconds: number | null = null;
  let mimeType = 'audio/webm';
  let recordedAt = new Date().toISOString();
  let metadata: Record<string, unknown> = {};

  if (contentType.includes('multipart/form-data')) {
    // Upload de arquivo real
    const formData = await req.formData();
    const file = formData.get('audio') as File | null;
    const durationStr = formData.get('duration') as string | null;
    const recordedAtStr = formData.get('recorded_at') as string | null;
    const metadataStr = formData.get('metadata') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'Campo "audio" obrigatório' }, { status: 400 });
    }

    // Validar tipo
    const allowedTypes = ['audio/webm', 'audio/wav', 'audio/mp3', 'audio/mpeg', 'audio/ogg', 'audio/mp4'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: `Formato não suportado: ${file.type}` }, { status: 400 });
    }

    // Validar tamanho (max 50MB)
    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: 'Arquivo excede 50MB' }, { status: 400 });
    }

    mimeType = file.type;
    fileSize = file.size;
    durationSeconds = durationStr ? parseFloat(durationStr) : null;
    recordedAt = recordedAtStr ?? recordedAt;
    metadata = metadataStr ? JSON.parse(metadataStr) : {};

    // Upload para Supabase Storage
    const fileName = `${receiver.sector_id}/${receiver.id}/${Date.now()}.${getExtension(mimeType)}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadErr } = await admin.storage
      .from('audio-segments')
      .upload(fileName, buffer, { contentType: mimeType });

    if (uploadErr) {
      return NextResponse.json({ error: `Falha no upload: ${uploadErr.message}` }, { status: 500 });
    }

    storagePath = fileName;
  } else if (contentType.includes('application/json')) {
    // JSON mock para testes ou integração com sistemas (ERP, CNC, etc.)
    const body = await req.json();
    durationSeconds = body.duration_seconds ?? null;
    recordedAt = body.recorded_at ?? recordedAt;
    metadata = body.metadata ?? {};
    mimeType = body.mime_type ?? 'text/plain';
    storagePath = `mock/${receiver.sector_id}/${receiver.id}/${Date.now()}.json`;
    fileSize = JSON.stringify(body).length;

    // Salvar mock no storage como JSON
    const mockContent = JSON.stringify({
      mock: true,
      text: body.text ?? '',
      source: body.source ?? 'api_test',
      ...metadata,
    });

    const { error: uploadErr } = await admin.storage
      .from('audio-segments')
      .upload(storagePath, Buffer.from(mockContent), { contentType: 'application/json' });

    if (uploadErr) {
      return NextResponse.json({ error: `Falha no upload mock: ${uploadErr.message}` }, { status: 500 });
    }
  } else {
    return NextResponse.json({ error: 'Content-Type deve ser multipart/form-data ou application/json' }, { status: 400 });
  }

  // 4. Criar audio_segment
  const { data: segment, error: segErr } = await admin
    .from('audio_segments')
    .insert({
      receiver_id: receiver.id,
      sector_id: receiver.sector_id,
      storage_path: storagePath,
      file_size: fileSize,
      duration_seconds: durationSeconds,
      mime_type: mimeType,
      recorded_at: recordedAt,
      status: 'queued',
      retention_expires_at: retentionDate.toISOString(),
      metadata: {
        ...metadata,
        receiver_name: receiver.name,
        sector_name: (receiver.sectors as any)?.name ?? '',
        source_integration: metadata.source ?? 'audio_device',
      },
    })
    .select('id, status, recorded_at, retention_expires_at')
    .single();

  if (segErr) {
    return NextResponse.json({ error: `Falha ao criar segmento: ${segErr.message}` }, { status: 500 });
  }

  // 5. Audit log
  await logAudit({
    userId: undefined,
    action: 'create',
    resourceType: 'audio_segment',
    resourceId: segment.id,
    details: {
      receiver_id: receiver.id,
      receiver_name: receiver.name,
      sector_id: receiver.sector_id,
      file_size: fileSize,
      duration_seconds: durationSeconds,
      mime_type: mimeType,
    },
  });

  return NextResponse.json({
    success: true,
    segment: {
      id: segment.id,
      status: segment.status,
      recorded_at: segment.recorded_at,
      retention_expires_at: segment.retention_expires_at,
    },
  }, { status: 201 });
}

function getExtension(mime: string): string {
  const map: Record<string, string> = {
    'audio/webm': 'webm',
    'audio/wav': 'wav',
    'audio/mp3': 'mp3',
    'audio/mpeg': 'mp3',
    'audio/ogg': 'ogg',
    'audio/mp4': 'm4a',
  };
  return map[mime] ?? 'bin';
}
