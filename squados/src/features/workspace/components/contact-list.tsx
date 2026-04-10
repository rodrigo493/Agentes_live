'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Search, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getOrCreateDMConversation } from '../actions/workspace-actions';

interface Contact {
  id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
  role: string;
  status: string;
  sector_id: string | null;
  last_seen_at: string | null;
  sectors: { name: string } | { name: string }[] | null;
}

export function ContactList({ contacts }: { contacts: Contact[] }) {
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState<string | null>(null);
  const router = useRouter();

  const filtered = contacts.filter(
    (c) =>
      c.full_name.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase()) ||
      (Array.isArray(c.sectors) ? c.sectors[0]?.name : c.sectors?.name)?.toLowerCase().includes(search.toLowerCase())
  );

  async function handleOpenDM(contactId: string) {
    setLoading(contactId);
    const result = await getOrCreateDMConversation(contactId);
    if (result.data) {
      router.push(`/workspace/dm/${contactId}`);
    }
    setLoading(null);
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar contatos..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="space-y-2">
        {filtered.map((contact) => (
          <Card key={contact.id} className="flex items-center justify-between p-3">
            <div className="flex items-center gap-3">
              <Avatar>
                {contact.avatar_url && <AvatarImage src={contact.avatar_url} alt={contact.full_name} />}
                <AvatarFallback>
                  {contact.full_name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium text-sm">{contact.full_name}</p>
                <div className="flex items-center gap-2">
                  {contact.sectors && (
                    <Badge variant="secondary" className="text-xs">
                      {Array.isArray(contact.sectors) ? contact.sectors[0]?.name : contact.sectors.name}
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground capitalize">
                    {contact.role.replace('_', ' ')}
                  </span>
                </div>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleOpenDM(contact.id)}
              disabled={loading === contact.id}
              title="Enviar mensagem"
            >
              <MessageSquare className="h-4 w-4" />
            </Button>
          </Card>
        ))}

        {filtered.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">
            Nenhum contato encontrado
          </p>
        )}
      </div>
    </div>
  );
}
