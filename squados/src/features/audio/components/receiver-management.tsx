'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Mic,
  Plus,
  Search,
  Trash2,
  Copy,
  CheckCircle2,
  XCircle,
  Wrench,
  AlertTriangle,
  Radio,
} from 'lucide-react';
import {
  createReceiverAction,
  updateReceiverAction,
  deleteReceiverAction,
} from '../actions/audio-receiver-actions';

interface ReceiverWithSector {
  id: string;
  name: string;
  sector_id: string;
  location_description: string | null;
  device_identifier: string | null;
  status: string;
  device_token: string | null;
  config: Record<string, unknown>;
  created_at: string;
  sectors: { name: string; slug: string } | null;
}

interface Sector {
  id: string;
  name: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  active: { label: 'Ativo', color: 'bg-emerald-100 text-emerald-800', icon: CheckCircle2 },
  inactive: { label: 'Inativo', color: 'bg-gray-100 text-gray-800', icon: XCircle },
  maintenance: { label: 'Manutenção', color: 'bg-amber-100 text-amber-800', icon: Wrench },
  error: { label: 'Erro', color: 'bg-red-100 text-red-800', icon: AlertTriangle },
};

export function ReceiverManagement({
  receivers,
  sectors,
}: {
  receivers: ReceiverWithSector[];
  sectors: Sector[];
}) {
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [tokenDialog, setTokenDialog] = useState<{ name: string; token: string } | null>(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const router = useRouter();

  const filtered = receivers.filter(
    (r) =>
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      (r.sectors as any)?.name?.toLowerCase().includes(search.toLowerCase()) ||
      r.location_description?.toLowerCase().includes(search.toLowerCase())
  );

  async function handleCreate(formData: FormData) {
    setCreating(true);
    setError('');
    const result = await createReceiverAction(formData);
    if (result.error) {
      setError(result.error);
    } else {
      setCreateOpen(false);
      if (result.data?.device_token) {
        setTokenDialog({ name: result.data.name, token: result.data.device_token });
      }
      router.refresh();
    }
    setCreating(false);
  }

  async function handleStatusChange(id: string, status: string) {
    await updateReceiverAction(id, { status });
    router.refresh();
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Desativar receptor "${name}"? Esta ação pode ser revertida.`)) return;
    await deleteReceiverAction(id);
    router.refresh();
  }

  function copyToken(token: string) {
    navigator.clipboard.writeText(token);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
  }

  return (
    <>
      {/* Search + Create */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar receptores..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Novo Receptor
        </Button>
      </div>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Receptor de Áudio</DialogTitle>
          </DialogHeader>
          <form action={handleCreate} className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
            )}
            <div className="space-y-2">
              <Label htmlFor="name">Nome do receptor</Label>
              <Input id="name" name="name" placeholder="Ex: Mic Solda Linha 1" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sector_id">Setor / Zona</Label>
              <select
                name="sector_id"
                id="sector_id"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                required
              >
                <option value="">Selecione o setor</option>
                {sectors.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="location_description">Localização física</Label>
              <Input
                id="location_description"
                name="location_description"
                placeholder="Ex: Galpão 2, próximo à estação 4"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="device_identifier">Identificador do dispositivo (MAC/serial)</Label>
              <Input
                id="device_identifier"
                name="device_identifier"
                placeholder="Ex: AA:BB:CC:DD:EE:FF"
              />
            </div>
            <Button type="submit" className="w-full" disabled={creating}>
              {creating ? 'Criando...' : 'Criar Receptor'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Token Dialog (shown after creation) */}
      <Dialog open={!!tokenDialog} onOpenChange={() => setTokenDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Receptor Criado: {tokenDialog?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md bg-amber-50 border border-amber-200 p-3">
              <p className="text-sm font-medium text-amber-800">
                Copie o token abaixo. Ele não será exibido novamente.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Device Token (Authorization: Bearer ...)</Label>
              <div className="flex gap-2">
                <Input
                  value={tokenDialog?.token ?? ''}
                  readOnly
                  className="font-mono text-xs"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copyToken(tokenDialog?.token ?? '')}
                >
                  {copiedToken ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Use este token no header <code>Authorization: Bearer TOKEN</code> para enviar áudio via API.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Receivers Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((receiver) => {
          const statusCfg = STATUS_CONFIG[receiver.status] ?? STATUS_CONFIG.error;
          const StatusIcon = statusCfg.icon;
          return (
            <Card key={receiver.id} className="hover:shadow-md transition-all">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-lg bg-primary/10">
                      <Mic className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold">{receiver.name}</h3>
                      <p className="text-[11px] text-muted-foreground">
                        {(receiver.sectors as any)?.name ?? 'Sem setor'}
                      </p>
                    </div>
                  </div>
                  <Badge className={`text-[10px] gap-1 ${statusCfg.color}`}>
                    <StatusIcon className="w-3 h-3" />
                    {statusCfg.label}
                  </Badge>
                </div>

                {receiver.location_description && (
                  <p className="text-xs text-muted-foreground">{receiver.location_description}</p>
                )}

                {receiver.device_identifier && (
                  <div className="flex items-center gap-1.5">
                    <Radio className="w-3 h-3 text-muted-foreground" />
                    <span className="text-[11px] font-mono text-muted-foreground">
                      {receiver.device_identifier}
                    </span>
                  </div>
                )}

                <div className="flex items-center gap-2 pt-1">
                  <select
                    value={receiver.status}
                    onChange={(e) => handleStatusChange(receiver.id, e.target.value)}
                    className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs"
                  >
                    <option value="active">Ativo</option>
                    <option value="inactive">Inativo</option>
                    <option value="maintenance">Manutenção</option>
                    <option value="error">Erro</option>
                  </select>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => handleDelete(receiver.id, receiver.name)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {filtered.length === 0 && (
          <div className="col-span-full p-8 text-center text-muted-foreground">
            Nenhum receptor encontrado.
          </div>
        )}
      </div>
    </>
  );
}
