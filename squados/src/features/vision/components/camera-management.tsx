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
  Camera,
  Plus,
  Search,
  Trash2,
  Copy,
  CheckCircle2,
  XCircle,
  Wrench,
  AlertTriangle,
  MapPin,
  Cpu,
} from 'lucide-react';
import { createCameraAction, updateCameraAction, deleteCameraAction } from '../actions/vision-actions';

interface CameraWithSector {
  id: string;
  name: string;
  sector_id: string;
  cell_name: string | null;
  location_description: string | null;
  device_identifier: string | null;
  camera_type: string;
  status: string;
  device_token: string | null;
  created_at: string;
  sectors: { name: string; slug: string } | null;
}

interface Sector {
  id: string;
  name: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  provisioned: { label: 'Provisionada', color: 'bg-blue-100 text-blue-800', icon: Cpu },
  active: { label: 'Ativa', color: 'bg-emerald-100 text-emerald-800', icon: CheckCircle2 },
  inactive: { label: 'Inativa', color: 'bg-gray-100 text-gray-800', icon: XCircle },
  maintenance: { label: 'Manutenção', color: 'bg-amber-100 text-amber-800', icon: Wrench },
  error: { label: 'Erro', color: 'bg-red-100 text-red-800', icon: AlertTriangle },
};

const CAMERA_TYPE_LABELS: Record<string, string> = {
  ip_camera: 'Câmera IP',
  usb_camera: 'Câmera USB',
  industrial: 'Industrial',
  mobile: 'Móvel',
  simulated: 'Simulada',
};

export function CameraManagement({ cameras, sectors }: { cameras: CameraWithSector[]; sectors: Sector[] }) {
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [tokenDialog, setTokenDialog] = useState<{ name: string; token: string } | null>(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const router = useRouter();

  const filtered = cameras.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.sectors as any)?.name?.toLowerCase().includes(search.toLowerCase()) ||
      c.cell_name?.toLowerCase().includes(search.toLowerCase())
  );

  async function handleCreate(formData: FormData) {
    setCreating(true);
    setError('');
    const result = await createCameraAction(formData);
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
    await updateCameraAction(id, { status });
    router.refresh();
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Desativar câmera "${name}"?`)) return;
    await deleteCameraAction(id);
    router.refresh();
  }

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar câmeras..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Nova Câmera
        </Button>
      </div>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Câmera</DialogTitle>
          </DialogHeader>
          <form action={handleCreate} className="space-y-4">
            {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
            <div className="space-y-2">
              <Label htmlFor="name">Nome</Label>
              <Input id="name" name="name" placeholder="Ex: Câmera Solda Célula 3" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sector_id">Setor</Label>
              <select name="sector_id" id="sector_id" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" required>
                <option value="">Selecione</option>
                {sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cell_name">Célula de produção</Label>
              <Input id="cell_name" name="cell_name" placeholder="Ex: Célula Solda 3" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="camera_type">Tipo</Label>
              <select name="camera_type" id="camera_type" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="ip_camera">Câmera IP</option>
                <option value="usb_camera">Câmera USB</option>
                <option value="industrial">Industrial</option>
                <option value="mobile">Móvel</option>
                <option value="simulated">Simulada (teste)</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="location_description">Localização física</Label>
              <Input id="location_description" name="location_description" placeholder="Ex: Galpão 2, acima da estação 4" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="device_identifier">IP / MAC / Serial</Label>
              <Input id="device_identifier" name="device_identifier" placeholder="Ex: 192.168.1.50" />
            </div>
            <Button type="submit" className="w-full" disabled={creating}>
              {creating ? 'Criando...' : 'Criar Câmera'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Token Dialog */}
      <Dialog open={!!tokenDialog} onOpenChange={() => setTokenDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Câmera Criada: {tokenDialog?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md bg-amber-50 border border-amber-200 p-3">
              <p className="text-sm font-medium text-amber-800">Copie o token. Ele não será exibido novamente.</p>
            </div>
            <div className="flex gap-2">
              <Input value={tokenDialog?.token ?? ''} readOnly className="font-mono text-xs" />
              <Button variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(tokenDialog?.token ?? ''); setCopiedToken(true); setTimeout(() => setCopiedToken(false), 2000); }}>
                {copiedToken ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Camera Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((camera) => {
          const statusCfg = STATUS_CONFIG[camera.status] ?? STATUS_CONFIG.error;
          const StatusIcon = statusCfg.icon;
          return (
            <Card key={camera.id} className="hover:shadow-md transition-all">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-lg bg-primary/10">
                      <Camera className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold">{camera.name}</h3>
                      <p className="text-[11px] text-muted-foreground">{(camera.sectors as any)?.name}</p>
                    </div>
                  </div>
                  <Badge className={`text-[10px] gap-1 ${statusCfg.color}`}>
                    <StatusIcon className="w-3 h-3" />
                    {statusCfg.label}
                  </Badge>
                </div>

                {camera.cell_name && (
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-3 h-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">{camera.cell_name}</span>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">{CAMERA_TYPE_LABELS[camera.camera_type] ?? camera.camera_type}</Badge>
                  {camera.device_identifier && <span className="text-[10px] font-mono text-muted-foreground">{camera.device_identifier}</span>}
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <select
                    value={camera.status}
                    onChange={(e) => handleStatusChange(camera.id, e.target.value)}
                    className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs"
                  >
                    <option value="provisioned">Provisionada</option>
                    <option value="active">Ativa</option>
                    <option value="inactive">Inativa</option>
                    <option value="maintenance">Manutenção</option>
                    <option value="error">Erro</option>
                  </select>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(camera.id, camera.name)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {filtered.length === 0 && (
          <div className="col-span-full p-8 text-center text-muted-foreground">Nenhuma câmera encontrada.</div>
        )}
      </div>
    </>
  );
}
