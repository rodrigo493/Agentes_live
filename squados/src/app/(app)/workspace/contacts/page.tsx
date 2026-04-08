import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Search, MessageSquare } from 'lucide-react';

export default async function ContactsPage() {
  await getAuthenticatedUser();
  const admin = createAdminClient();

  const { data: profiles } = await admin
    .from('profiles')
    .select('id, full_name, role, status, sector_id')
    .order('full_name');

  const contacts = profiles ?? [];

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Left Panel - Contact / Conversation List */}
      <div className="w-80 border-r border-border flex flex-col bg-card">
        <div className="p-4 border-b border-border space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">Conversas</h2>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar contatos..."
              className="w-full pl-9 h-9 rounded-md border border-input bg-muted px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              readOnly
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {contacts.map((contact) => {
            const initials = (contact.full_name ?? 'U')
              .split(' ')
              .map((n: string) => n[0])
              .join('')
              .slice(0, 2)
              .toUpperCase();

            return (
              <div
                key={contact.id}
                className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors text-left border-b border-border/50 cursor-pointer"
              >
                {/* Avatar */}
                <div className="relative">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-semibold text-primary">{initials}</span>
                  </div>
                  {contact.status === 'active' && (
                    <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-card" />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold truncate">{contact.full_name}</span>
                    <Badge variant="secondary" className="text-[10px] flex-shrink-0 capitalize">
                      {contact.role?.replace('_', ' ') ?? 'user'}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <p className="text-xs text-muted-foreground truncate flex-1">
                      {contact.status === 'active' ? 'Online' : 'Offline'}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}

          {contacts.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Nenhum contato encontrado.
            </div>
          )}
        </div>
      </div>

      {/* Right Panel - Chat Placeholder */}
      <div className="flex-1 flex flex-col items-center justify-center bg-muted/30">
        <div className="text-center space-y-3">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <MessageSquare className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Selecione uma conversa</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Escolha um contato para iniciar uma conversa
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
