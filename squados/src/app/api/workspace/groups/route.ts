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

  const admin = createAdminClient();

  // Check role - only admin/master_admin
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();

  if (!profile || !['admin', 'master_admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { name, description, member_ids, avatar_url } = await req.json();

  if (!name || !member_ids || member_ids.length === 0) {
    return NextResponse.json({ error: 'name and member_ids required' }, { status: 400 });
  }

  // Create group
  const { data: group, error: groupError } = await admin
    .from('groups')
    .insert({
      name,
      description: description || null,
      avatar_url: avatar_url || null,
      created_by: userId,
    })
    .select()
    .single();

  if (groupError) {
    return NextResponse.json({ error: groupError.message }, { status: 500 });
  }

  // Add members (creator as admin + selected as members)
  const allMemberIds = [userId, ...member_ids.filter((id: string) => id !== userId)];
  const members = allMemberIds.map((id: string, i: number) => ({
    group_id: group.id,
    user_id: id,
    role: i === 0 ? 'admin' : 'member',
    added_by: userId,
  }));

  await admin.from('group_members').insert(members);

  // Create group conversation
  const { data: conversation, error: convError } = await admin
    .from('conversations')
    .insert({
      type: 'group',
      group_id: group.id,
      participant_ids: allMemberIds,
      title: name,
    })
    .select()
    .single();

  if (convError) {
    return NextResponse.json({ error: convError.message }, { status: 500 });
  }

  return NextResponse.json({ group, conversation });
}
