'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { UserPlus, Search, Pencil } from 'lucide-react';
import { createClient } from '@/shared/lib/supabase/client';
import {
  createUserAction,
  updateUserAction,
  updateUserCredentialsAction,
  deactivateUserAction,
  updateUserAvatarAction,
  getUserSectorsAction,
  updateUserSectorsAction,
} from '../actions/user-actions';
import { SectorCheckboxList } from './sector-checkbox-list';
import type { Sector } from '@/shared/types/database';

interface UserWithSector {
  id: string;
  full_name: string;
  email: string;
  role: string;
  status: string;
  phone: string | null;
  sector_id: string | null;
  created_at: string;
  sectors: { name: string; slug: string } | { name: string; slug: string }[] | null;
}

const ROLE_COLORS: Record<string, string> = {
  master_admin: 'bg-red-100 text-red-800',
  admin: 'bg-orange-100 text-orange-800',
  manager: 'bg-blue-100 text-blue-800',
  operator: 'bg-green-100 text-green-800',
  viewer: 'bg-gray-100 text-gray-800',
};

const ROLE_LABELS: Record<string, string> = {
  master_admin: 'Master Admin',
  admin: 'Admin',
  manager: 'Gestor',
  operator: 'Operador',
  viewer: 'Viewer',
};

const STATUS_LABELS: Record<string, string> = {
  active: 'Ativo',
  inactive: 'Inativo',
  suspended: 'Suspenso',
};

export function UserManagement({
  users,
  sectors,
  currentUserRole,
  allSectors,
}: {
  users: UserWithSector[];
  sectors: Sector[];
  currentUserRole: string;
  allSectors: { id: string; name: string; icon: string | null }[];
}) {
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserWithSector | null>(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  // Edit profile fields
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState('');
  const [editSector, setEditSector] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editStatus, setEditStatus] = useState('');

  // Edit credentials (admin+ only)
  const [editEmail, setEditEmail] = useState('');
  const [editPassword, setEditPassword] = useState('');

  const [createAvatarFile, setCreateAvatarFile] = useState<File | null>(null);
  const [createAvatarPreview, setCreateAvatarPreview] = useState<string | null>(null);
  const createAvatarInputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  const canEditCredentials = currentUserRole === 'admin' || currentUserRole === 'master_admin';

  const [createSectorIds, setCreateSectorIds] = useState<string[]>([]);
  const [editSectorIds, setEditSectorIds] = useState<string[]>([]);
  const [loadingSectors, setLoadingSectors] = useState(false);

  const filtered = users.filter(
    (u) =>
      u.full_name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
  );

  async function openEdit(user: UserWithSector) {
    setEditUser(user);
    setEditName(user.full_name);
    setEditRole(user.role);
    setEditSector(user.sector_id ?? '');
    setEditPhone(user.phone ?? '');
    setEditStatus(user.status);
    setEditEmail('');
    setEditPassword('');
    setError('');
    setEditSectorIds([]);
    setEditOpen(true);

    // Carregar setores do usuário
    setLoadingSectors(true);
    const result = await getUserSectorsAction(user.id);
    if ('data' in result) {
      setEditSectorIds(result.data.map((d: { sector_id: string }) => d.sector_id));
    }
    setLoadingSectors(false);
  }

  async function uploadAvatarForUser(userId: string, file: File): Promise<string | null> {
    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `${userId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true });
    if (error) return null;
    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    return data.publicUrl;
  }

  async function handleCreate(formData: FormData) {
    setCreating(true);
    setError('');
    const result = await createUserAction(formData);
    if (result.error) {
      setError(result.error);
      setCreating(false);
      return;
    }

    // Upload avatar if selected
    if (createAvatarFile && result.userId) {
      const url = await uploadAvatarForUser(result.userId, createAvatarFile);
      if (url) await updateUserAvatarAction(result.userId, url);
    }

    // Salvar setores
    if (result.userId && createSectorIds.length > 0) {
      await updateUserSectorsAction(result.userId, createSectorIds);
    }

    setCreateAvatarFile(null);
    setCreateAvatarPreview(null);
    setCreateSectorIds([]);
    setCreateOpen(false);
    router.refresh();
    setCreating(false);
  }

  async function handleSaveEdit() {
    if (!editUser) return;
    setSaving(true);
    setError('');

    // Update profile fields
    const data: Record<string, unknown> = {};
    if (editName !== editUser.full_name) data.full_name = editName;
    if (editRole !== editUser.role) data.role = editRole;
    if ((editSector || null) !== editUser.sector_id) data.sector_id = editSector || null;
    if ((editPhone || null) !== editUser.phone) data.phone = editPhone || null;
    if (editStatus !== editUser.status) data.status = editStatus;

    if (Object.keys(data).length > 0) {
      const result = await updateUserAction(editUser.id, data);
      if (result.error) {
        setError(result.error);
        setSaving(false);
        return;
      }
    }

    // Update credentials if admin+ and fields provided
    if (canEditCredentials && (editEmail || editPassword)) {
      const credResult = await updateUserCredentialsAction(editUser.id, {
        email: editEmail || undefined,
        password: editPassword || undefined,
      });
      if (credResult.error) {
        setError(credResult.error);
        setSaving(false);
        return;
      }
    }

    // Atualizar setores
    if (canEditCredentials) {
      await updateUserSectorsAction(editUser.id, editSectorIds);
    }

    setEditOpen(false);
    router.refresh();
    setSaving(false);
  }

  async function handleDeactivate() {
    if (!editUser) return;
    if (!confirm(`Desativar o usuário ${editUser.full_name}?`)) return;
    setSaving(true);
    setError('');

    const result = await deactivateUserAction(editUser.id);
    if (result.error) {
      setError(result.error);
    } else {
      setEditOpen(false);
      router.refresh();
    }
    setSaving(false);
  }

  function getSectorName(user: UserWithSector): string | null {
    if (!user.sectors) return null;
    if (Array.isArray(user.sectors)) return user.sectors[0]?.name ?? null;
    return user.sectors.name;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar usuários..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <Button onClick={() => { setError(''); setCreateOpen(true); }}>
          <UserPlus className="mr-2 h-4 w-4" />
          Novo Usuário
        </Button>
      </div>

      {/* Create User Dialog */}
      <Dialog open={createOpen} onOpenChange={(open) => {
        if (!open) {
          setCreateAvatarFile(null);
          setCreateAvatarPreview(null);
          setError('');
        }
        setCreateOpen(open);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Criar Usuário</DialogTitle>
          </DialogHeader>
          <form action={handleCreate} className="space-y-4">
            {error && createOpen && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
            )}
            {/* Avatar upload opcional */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 border border-border">
              <div
                className="w-12 h-12 rounded-full bg-muted flex items-center justify-center flex-shrink-0 overflow-hidden cursor-pointer"
                onClick={() => createAvatarInputRef.current?.click()}
              >
                {createAvatarPreview ? (
                  <img src={createAvatarPreview} alt="preview" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-muted-foreground text-xl">👤</span>
                )}
              </div>
              <div>
                <p className="text-xs font-medium mb-1">
                  Foto de perfil <span className="text-muted-foreground">(opcional)</span>
                </p>
                <button
                  type="button"
                  className="text-xs px-2.5 py-1 rounded-md border border-input bg-background hover:bg-accent transition-colors"
                  onClick={() => createAvatarInputRef.current?.click()}
                >
                  Selecionar foto
                </button>
              </div>
              <input
                ref={createAvatarInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > 2 * 1024 * 1024) {
                    setError('Imagem muito grande. Máximo 2 MB.');
                    return;
                  }
                  setCreateAvatarFile(file);
                  setCreateAvatarPreview(URL.createObjectURL(file));
                  e.target.value = '';
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="full_name">Nome completo</Label>
              <Input id="full_name" name="full_name" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input id="password" name="password" type="password" minLength={8} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Perfil</Label>
              <select name="role" id="role" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" defaultValue="operator">
                <option value="viewer">Viewer</option>
                <option value="operator">Operador</option>
                <option value="manager">Gestor</option>
                <option value="admin">Admin</option>
                <option value="master_admin">Master Admin</option>
              </select>
            </div>
            {canEditCredentials && (
              <div className="space-y-2">
                <Label>
                  Setores permitidos <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <SectorCheckboxList
                  sectors={allSectors}
                  selectedIds={createSectorIds}
                  onChange={setCreateSectorIds}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="phone">Telefone</Label>
              <Input id="phone" name="phone" />
            </div>
            <Button type="submit" className="w-full" disabled={creating}>
              {creating ? 'Criando...' : 'Criar Usuário'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Usuário</DialogTitle>
          </DialogHeader>
          {editUser && (
            <div className="space-y-4">
              {error && editOpen && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
              )}

              <div className="space-y-2">
                <Label>Nome completo</Label>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Perfil</Label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="viewer">Viewer</option>
                  <option value="operator">Operador</option>
                  <option value="manager">Gestor</option>
                  <option value="admin">Admin</option>
                  <option value="master_admin">Master Admin</option>
                </select>
              </div>

              {canEditCredentials && (
                <div className="space-y-2">
                  <Label>Setores permitidos</Label>
                  {loadingSectors ? (
                    <p className="text-xs text-muted-foreground">Carregando setores...</p>
                  ) : (
                    <SectorCheckboxList
                      sectors={allSectors}
                      selectedIds={editSectorIds}
                      onChange={setEditSectorIds}
                    />
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder="(00) 00000-0000"
                />
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="active">Ativo</option>
                  <option value="inactive">Inativo</option>
                  <option value="suspended">Suspenso</option>
                </select>
              </div>

              {/* Credentials section — admin+ only */}
              {canEditCredentials && (
                <div className="space-y-3 border-t pt-3">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Credenciais de acesso
                  </p>

                  <div className="space-y-2">
                    <Label>Email atual</Label>
                    <div className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                      {editUser.email}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="new_email">Novo email <span className="text-muted-foreground">(opcional)</span></Label>
                    <Input
                      id="new_email"
                      type="email"
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      placeholder="deixe em branco para manter"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="new_password">Nova senha <span className="text-muted-foreground">(opcional)</span></Label>
                    <Input
                      id="new_password"
                      type="password"
                      value={editPassword}
                      onChange={(e) => setEditPassword(e.target.value)}
                      placeholder="deixe em branco para manter"
                      minLength={8}
                    />
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  onClick={handleSaveEdit}
                  disabled={saving}
                  className="flex-1"
                >
                  {saving ? 'Salvando...' : 'Salvar Alterações'}
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDeactivate}
                  disabled={saving || editUser.status !== 'active'}
                  className="flex-shrink-0"
                >
                  Desativar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Users Table */}
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="text-left p-3 font-medium text-muted-foreground">Usuário</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Perfil</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Setor</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Telefone</th>
              <th className="text-right p-3 font-medium text-muted-foreground">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((user) => {
              const sectorName = getSectorName(user);
              return (
                <tr key={user.id} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-semibold text-primary">
                          {user.full_name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium">{user.full_name}</p>
                        <p className="text-[11px] text-muted-foreground">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-3">
                    <Badge className={`text-[10px] ${ROLE_COLORS[user.role] ?? ''}`}>
                      {ROLE_LABELS[user.role] ?? user.role}
                    </Badge>
                  </td>
                  <td className="p-3 text-muted-foreground text-xs">
                    {sectorName ?? '—'}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-1.5">
                      <div
                        className={`w-2 h-2 rounded-full ${
                          user.status === 'active'
                            ? 'bg-emerald-500'
                            : user.status === 'suspended'
                              ? 'bg-amber-500'
                              : 'bg-muted-foreground'
                        }`}
                      />
                      <span className="text-xs">{STATUS_LABELS[user.status] ?? user.status}</span>
                    </div>
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {user.phone || '—'}
                  </td>
                  <td className="p-3 text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => openEdit(user)}
                      title="Editar usuário"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-muted-foreground">
                  Nenhum usuário encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <p className="text-xs text-muted-foreground text-right">
        {filtered.length} de {users.length} usuário{users.length !== 1 ? 's' : ''}
      </p>
    </div>
  );
}
