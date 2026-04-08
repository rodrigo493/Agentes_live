-- ============================================================
-- MÓDULO DE INGESTÃO DE ÁUDIO POR ZONAS DA FÁBRICA
-- LGPD by design | Governança | Revisão humana obrigatória
-- ============================================================

-- Receptores de áudio (pontos de captura mapeados a setores)
CREATE TABLE IF NOT EXISTS audio_receivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sector_id UUID NOT NULL REFERENCES sectors(id),
  name TEXT NOT NULL,
  location_description TEXT,
  device_identifier TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'maintenance', 'error')),
  config JSONB NOT NULL DEFAULT '{"sample_rate": 16000, "format": "webm", "chunk_duration_seconds": 60}',
  sensitivity_config JSONB NOT NULL DEFAULT '{"min_confidence_for_alert": 0.7, "categories_enabled": ["safety_incident","cultural_alignment","harassment_conflict","information_leakage","fraud_indicator"]}',
  device_token TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Segmentos de áudio (chunks armazenados no Supabase Storage)
CREATE TABLE IF NOT EXISTS audio_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receiver_id UUID NOT NULL REFERENCES audio_receivers(id),
  sector_id UUID NOT NULL REFERENCES sectors(id),
  storage_path TEXT NOT NULL,
  file_size INTEGER,
  duration_seconds FLOAT,
  mime_type TEXT NOT NULL DEFAULT 'audio/webm',
  recorded_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('uploading', 'queued', 'transcribing', 'classifying', 'completed', 'failed')),
  retry_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  retention_expires_at TIMESTAMPTZ NOT NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Transcrições de áudio (texto transcrito + classificação)
CREATE TABLE IF NOT EXISTS audio_transcriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_id UUID NOT NULL REFERENCES audio_segments(id),
  receiver_id UUID NOT NULL REFERENCES audio_receivers(id),
  sector_id UUID NOT NULL REFERENCES sectors(id),
  raw_text TEXT NOT NULL,
  anonymized_text TEXT,
  language TEXT DEFAULT 'pt-BR',
  confidence FLOAT,
  word_timestamps JSONB,
  transcription_model TEXT DEFAULT 'whisper-1',
  transcription_duration_ms INTEGER,
  -- Classificação
  event_category TEXT NOT NULL DEFAULT 'normal_operations' CHECK (event_category IN ('normal_operations', 'safety_incident', 'cultural_alignment', 'process_deviation', 'harassment_conflict', 'information_leakage', 'fraud_indicator')),
  event_severity TEXT NOT NULL DEFAULT 'none' CHECK (event_severity IN ('none', 'low', 'medium', 'high', 'critical')),
  classification_reasoning TEXT,
  classification_confidence FLOAT,
  classification_model TEXT,
  -- Linkagem com sistema existente
  knowledge_doc_id UUID REFERENCES knowledge_docs(id),
  processed_memory_id UUID REFERENCES processed_memory(id),
  maestro_alert_id UUID REFERENCES maestro_alerts(id),
  -- Anonimização
  speakers_detected INTEGER DEFAULT 0,
  speaker_map JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fila de revisão humana (NUNCA punição automática)
CREATE TABLE IF NOT EXISTS audio_event_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transcription_id UUID NOT NULL REFERENCES audio_transcriptions(id),
  sector_id UUID NOT NULL REFERENCES sectors(id),
  event_category TEXT NOT NULL,
  event_severity TEXT NOT NULL,
  anonymized_text TEXT NOT NULL,
  classification_reasoning TEXT,
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'confirmed', 'dismissed', 'escalated')),
  reviewed_by UUID REFERENCES profiles(id),
  review_notes TEXT,
  review_action TEXT,
  reviewed_at TIMESTAMPTZ,
  escalated_to UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Configuração LGPD por setor
CREATE TABLE IF NOT EXISTS audio_lgpd_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sector_id UUID REFERENCES sectors(id) UNIQUE,
  retention_days INTEGER NOT NULL DEFAULT 30,
  transcription_retention_days INTEGER NOT NULL DEFAULT 90,
  anonymize_by_default BOOLEAN NOT NULL DEFAULT true,
  require_explicit_consent BOOLEAN NOT NULL DEFAULT true,
  allowed_categories TEXT[] NOT NULL DEFAULT ARRAY['safety_incident', 'process_deviation'],
  created_by UUID REFERENCES profiles(id),
  updated_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Registros de consentimento LGPD
CREATE TABLE IF NOT EXISTS audio_consent_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id),
  sector_id UUID NOT NULL REFERENCES sectors(id),
  consent_type TEXT NOT NULL,
  consent_status TEXT NOT NULL DEFAULT 'active' CHECK (consent_status IN ('active', 'revoked', 'expired')),
  consent_given_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  consent_revoked_at TIMESTAMPTZ,
  legal_basis TEXT NOT NULL DEFAULT 'legitimate_interest',
  ip_address TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes para performance
CREATE INDEX IF NOT EXISTS idx_audio_segments_status ON audio_segments (status, created_at) WHERE status IN ('queued', 'transcribing', 'classifying');
CREATE INDEX IF NOT EXISTS idx_audio_segments_retention ON audio_segments (retention_expires_at) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_audio_segments_sector ON audio_segments (sector_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_audio_transcriptions_category ON audio_transcriptions (event_category, event_severity) WHERE event_category != 'normal_operations';
CREATE INDEX IF NOT EXISTS idx_audio_transcriptions_sector ON audio_transcriptions (sector_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audio_reviews_pending ON audio_event_reviews (review_status, created_at DESC) WHERE review_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_audio_receivers_sector ON audio_receivers (sector_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_audio_consent_user ON audio_consent_records (user_id, sector_id, consent_status);

-- Inserir config LGPD global padrão
INSERT INTO audio_lgpd_config (sector_id, retention_days, transcription_retention_days, anonymize_by_default, require_explicit_consent, allowed_categories)
VALUES (NULL, 30, 90, true, true, ARRAY['safety_incident', 'process_deviation', 'harassment_conflict', 'fraud_indicator'])
ON CONFLICT (sector_id) DO NOTHING;
