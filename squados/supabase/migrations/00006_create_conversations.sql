-- SquadOS: Conversations and messages

CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type conversation_type NOT NULL,
  sector_id UUID REFERENCES sectors(id),
  group_id UUID REFERENCES groups(id),
  participant_ids UUID[] NOT NULL DEFAULT '{}',
  title TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_conversations_type ON conversations(type);
CREATE INDEX idx_conversations_sector ON conversations(sector_id);
CREATE INDEX idx_conversations_group ON conversations(group_id);
CREATE INDEX idx_conversations_participants ON conversations USING GIN(participant_ids);
CREATE INDEX idx_conversations_last_message ON conversations(last_message_at DESC);

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES profiles(id),
  sender_type message_sender_type NOT NULL DEFAULT 'user',
  content TEXT NOT NULL,
  content_type message_content_type NOT NULL DEFAULT 'text',
  metadata JSONB NOT NULL DEFAULT '{}',
  reply_to_id UUID REFERENCES messages(id),
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  edited_at TIMESTAMPTZ
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at DESC);
CREATE INDEX idx_messages_sender ON messages(sender_id);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Conversations: only participants, group members, or admins can see
CREATE POLICY conversations_select ON conversations FOR SELECT USING (
  -- Direct participant
  auth.uid() = ANY(participant_ids)
  -- Group member
  OR EXISTS (
    SELECT 1 FROM group_members WHERE group_id = conversations.group_id AND user_id = auth.uid()
  )
  -- Agent chat: user is in the sector
  OR (type = 'agent' AND EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND sector_id = conversations.sector_id
  ))
  -- Admin access
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'master_admin'))
);

CREATE POLICY conversations_insert ON conversations FOR INSERT WITH CHECK (
  auth.uid() = ANY(participant_ids)
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'master_admin'))
);

CREATE POLICY conversations_update ON conversations FOR UPDATE USING (
  auth.uid() = ANY(participant_ids)
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'master_admin'))
);

-- Messages: only if user can see the conversation
CREATE POLICY messages_select ON messages FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM conversations c WHERE c.id = messages.conversation_id AND (
      auth.uid() = ANY(c.participant_ids)
      OR EXISTS (SELECT 1 FROM group_members WHERE group_id = c.group_id AND user_id = auth.uid())
      OR (c.type = 'agent' AND EXISTS (
        SELECT 1 FROM profiles WHERE id = auth.uid() AND sector_id = c.sector_id
      ))
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'master_admin'))
    )
  )
);

CREATE POLICY messages_insert ON messages FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM conversations c WHERE c.id = messages.conversation_id AND (
      auth.uid() = ANY(c.participant_ids)
      OR EXISTS (SELECT 1 FROM group_members WHERE group_id = c.group_id AND user_id = auth.uid())
      OR (c.type = 'agent' AND EXISTS (
        SELECT 1 FROM profiles WHERE id = auth.uid() AND sector_id = c.sector_id
      ))
    )
  )
);

-- Update last_message_at on new message
CREATE OR REPLACE FUNCTION update_conversation_last_message()
RETURNS trigger AS $$
BEGIN
  UPDATE conversations SET last_message_at = NEW.created_at WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_message_created
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION update_conversation_last_message();

CREATE TRIGGER conversations_updated_at
  BEFORE UPDATE ON conversations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
