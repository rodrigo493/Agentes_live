-- Tabela de alertas do Agente Maestro
-- Armazena alertas quando o Maestro detecta conversas contra missão/visão/cultura
CREATE TABLE IF NOT EXISTS maestro_alerts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID REFERENCES conversations(id),
  message_id UUID REFERENCES messages(id),
  sector_id UUID REFERENCES sectors(id),
  sector_name TEXT,
  user_name TEXT,
  alert_content TEXT NOT NULL,
  original_message TEXT,
  severity TEXT DEFAULT 'high' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  is_read BOOLEAN DEFAULT false,
  is_resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES profiles(id)
);

-- Index para buscar alertas não lidos rapidamente
CREATE INDEX IF NOT EXISTS idx_maestro_alerts_unread ON maestro_alerts (is_read, created_at DESC) WHERE is_read = false;
