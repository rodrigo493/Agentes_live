import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/shared/lib/supabase/server';
import { createAdminClient } from '@/shared/lib/supabase/admin';

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  // Authenticate
  let userId: string | undefined;
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    userId = user.id;
  } else {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) userId = session.user.id;
  }

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { otherUserId } = await req.json();
  if (!otherUserId) {
    return NextResponse.json({ error: 'otherUserId required' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Check existing DM
  const { data: existing } = await admin
    .from('conversations')
    .select('*')
    .eq('type', 'dm')
    .contains('participant_ids', [userId])
    .contains('participant_ids', [otherUserId]);

  const dm = existing?.find(
    (c) =>
      c.participant_ids.length === 2 &&
      c.participant_ids.includes(userId!) &&
      c.participant_ids.includes(otherUserId)
  );

  if (dm) {
    return NextResponse.json({ conversation: dm });
  }

  // Create new DM
  const { data, error } = await admin
    .from('conversations')
    .insert({
      type: 'dm',
      participant_ids: [userId, otherUserId],
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ conversation: data });
}
