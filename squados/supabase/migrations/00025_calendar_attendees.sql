ALTER TABLE calendar_events
ADD COLUMN IF NOT EXISTS attendees JSONB NOT NULL DEFAULT '[]';

COMMENT ON COLUMN calendar_events.attendees IS
  'Array of {email, name, response, organizer}. response: accepted|declined|tentative|needsAction';
