import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import { TrendingUp } from 'lucide-react';
import { PesquisasGrid } from './_components/pesquisas-grid';

export default async function PesquisasPage() {
  const { profile } = await getAuthenticatedUser();
  const admin = createAdminClient();

  const { data: pesquisas } = profile.active_sector_id
    ? await admin
        .from('knowledge_docs')
        .select('id, title, content, created_at')
        .eq('category', 'pesquisa_diaria')
        .eq('sector_id', profile.active_sector_id)
        .order('created_at', { ascending: false })
        .limit(50)
    : await admin
        .from('knowledge_docs')
        .select('id, title, content, created_at')
        .eq('category', 'pesquisa_diaria')
        .order('created_at', { ascending: false })
        .limit(50);

  const docs = (pesquisas ?? []).map((p) => ({
    id: p.id as string,
    title: p.title as string,
    content: p.content as string,
    created_at: p.created_at as string,
  }));

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <TrendingUp className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Pesquisas Estratégicas</h1>
          <p className="text-sm text-muted-foreground">
            {docs.length} {docs.length === 1 ? 'pesquisa disponível' : 'pesquisas disponíveis'}
          </p>
        </div>
      </div>
      <PesquisasGrid pesquisas={docs} />
    </div>
  );
}
