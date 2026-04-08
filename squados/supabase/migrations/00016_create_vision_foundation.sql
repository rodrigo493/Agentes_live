-- ============================================================
-- MÓDULO DE VISÃO COMPUTACIONAL — FUNDAÇÃO ESTRUTURAL
-- Foco: processo, qualidade, segurança
-- Sem reconhecimento facial | LGPD by design | Revisão humana
-- ============================================================

-- Dispositivos de câmera por célula/zona
CREATE TABLE IF NOT EXISTS camera_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sector_id UUID NOT NULL REFERENCES sectors(id),
  name TEXT NOT NULL,
  location_description TEXT,
  cell_name TEXT,                               -- célula de produção (ex: "Célula Solda 3")
  device_identifier TEXT UNIQUE,                -- IP, MAC ou serial da câmera
  camera_type TEXT NOT NULL DEFAULT 'ip_camera' CHECK (camera_type IN ('ip_camera', 'usb_camera', 'industrial', 'mobile', 'simulated')),
  stream_url TEXT,                              -- RTSP/HTTP stream (futuro)
  status TEXT NOT NULL DEFAULT 'provisioned' CHECK (status IN ('provisioned', 'active', 'inactive', 'maintenance', 'error')),
  config JSONB NOT NULL DEFAULT '{"resolution": "1280x720", "fps": 5, "capture_interval_seconds": 30}',
  detection_config JSONB NOT NULL DEFAULT '{"detect_epi": true, "detect_process_deviation": true, "detect_safety_risk": true, "detect_quality_anomaly": true, "detect_bottleneck": true}',
  device_token TEXT,                            -- auth para envio de capturas
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Capturas (frames/snapshots armazenados no Storage)
CREATE TABLE IF NOT EXISTS vision_captures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  camera_id UUID NOT NULL REFERENCES camera_devices(id),
  sector_id UUID NOT NULL REFERENCES sectors(id),
  storage_path TEXT NOT NULL,                   -- Supabase Storage path
  thumbnail_path TEXT,                          -- thumbnail para UI
  file_size INTEGER,
  resolution TEXT,
  captured_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'analyzing', 'completed', 'failed', 'skipped')),
  retry_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',         -- extensível: ERP data, CNC state, etc.
  retention_expires_at TIMESTAMPTZ NOT NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Eventos detectados por visão computacional
CREATE TABLE IF NOT EXISTS vision_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  capture_id UUID NOT NULL REFERENCES vision_captures(id),
  camera_id UUID NOT NULL REFERENCES camera_devices(id),
  sector_id UUID NOT NULL REFERENCES sectors(id),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'epi_missing',           -- EPI não detectado
    'epi_incorrect',         -- EPI incorreto
    'process_deviation',     -- desvio de processo
    'quality_anomaly',       -- anomalia de qualidade
    'safety_risk',           -- risco de segurança
    'bottleneck',            -- gargalo detectado
    'equipment_anomaly',     -- anomalia em equipamento
    'unauthorized_area',     -- presença em área restrita
    'idle_station',          -- estação ociosa
    'material_waste',        -- desperdício de material
    'other'
  )),
  severity TEXT NOT NULL DEFAULT 'low' CHECK (severity IN ('none', 'low', 'medium', 'high', 'critical')),
  confidence FLOAT,                             -- confiança da detecção (0-1)
  description TEXT,                             -- descrição gerada pela IA
  bounding_boxes JSONB DEFAULT '[]',            -- regiões detectadas [{x,y,w,h,label}]
  detection_model TEXT,                         -- modelo usado (futuro: YOLOv8, custom, etc.)
  -- Linkagem com sistema existente
  knowledge_doc_id UUID REFERENCES knowledge_docs(id),
  processed_memory_id UUID REFERENCES processed_memory(id),
  maestro_alert_id UUID REFERENCES maestro_alerts(id),
  -- Revisão humana obrigatória
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'confirmed', 'dismissed', 'escalated')),
  reviewed_by UUID REFERENCES profiles(id),
  review_notes TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Perfil de zona (configuração de detecção por célula/área)
CREATE TABLE IF NOT EXISTS vision_zone_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sector_id UUID NOT NULL REFERENCES sectors(id),
  zone_name TEXT NOT NULL,                      -- ex: "Célula Solda 3", "Entrada Galpão 2"
  zone_type TEXT NOT NULL DEFAULT 'production' CHECK (zone_type IN ('production', 'quality', 'logistics', 'safety', 'restricted', 'common')),
  required_epi TEXT[] DEFAULT '{}',             -- EPIs obrigatórios na zona
  expected_process TEXT,                        -- descrição do processo esperado
  risk_level TEXT DEFAULT 'medium' CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  detection_rules JSONB NOT NULL DEFAULT '{}',  -- regras customizadas por zona
  camera_ids UUID[] DEFAULT '{}',               -- câmeras vinculadas à zona
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- LGPD config para visão (separado do áudio)
CREATE TABLE IF NOT EXISTS vision_lgpd_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sector_id UUID REFERENCES sectors(id) UNIQUE,
  capture_retention_days INTEGER NOT NULL DEFAULT 7,
  event_retention_days INTEGER NOT NULL DEFAULT 90,
  blur_faces BOOLEAN NOT NULL DEFAULT true,
  blur_badges BOOLEAN NOT NULL DEFAULT true,
  store_raw_frames BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES profiles(id),
  updated_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_camera_devices_sector ON camera_devices (sector_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_vision_captures_status ON vision_captures (status, created_at) WHERE status IN ('queued', 'analyzing');
CREATE INDEX IF NOT EXISTS idx_vision_captures_sector ON vision_captures (sector_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_vision_captures_retention ON vision_captures (retention_expires_at) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_vision_events_type ON vision_events (event_type, severity) WHERE review_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_vision_events_sector ON vision_events (sector_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vision_events_review ON vision_events (review_status, created_at DESC) WHERE review_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_vision_zone_profiles_sector ON vision_zone_profiles (sector_id) WHERE is_active = true;

-- Config LGPD global padrão para visão
INSERT INTO vision_lgpd_config (sector_id, capture_retention_days, event_retention_days, blur_faces, blur_badges, store_raw_frames)
VALUES (NULL, 7, 90, true, true, false)
ON CONFLICT (sector_id) DO NOTHING;
