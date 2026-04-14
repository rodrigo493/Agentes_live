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
import {
  createUserAction,
  updateUserAction,
  updateUserCredentialsAction,
  deactivateUserAction,
  uploadAndSetUserAvatarAction,
  getUserSectorsAction,
  updateUserSectorsAction,
} from '../actions/user-actions';
import { SectorCheckboxList } from './sector-checkbox-list';
import type { Sector } from '@/shared/types/database';

const NAV_ITEMS_FOR_NON_ADMIN = [
  { href: '/dashboard',  label: 'Dashboard' },
  { href: '/workspace',  label: 'Workspace' },
  { href: '/email',      label: 'E-mails' },
  { href: '/producao',   label: 'Produção' },
  { href: '/calendario', label: 'Calendário' },
  { href: '/chat',       label: 'Chat com Agente' },
  { href: '/operations', label: 'Operações' },
  { href: '/sectors',    label: 'Setores' },
  { href: '/knowledge',  label: 'Conhecimento' },
  { href: '/memory',     label: 'Memória' },
  { href: '/audit',      label: 'Auditoria' },
  { href: '/settings',   label: 'Configurações' },
];

const DEFAULT_NAV = ['/workspace', '/email', '/chat', '/calendario'];

interface UserWithSector {
  id: string;
  full_name: string;
  email: string;
  role: string;
  status: string;
  phone: string | null;
  sector_id: string | null;
  avatar_url: string | null;
  allowed_nav_items: string[] | null;
  created_at: string;
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

function NavItemsCheckboxSection({
  navItems,
  setNavItems,
  editRole,
}: {
  navItems: string[];
  setNavItems: React.Dispatch<React.SetStateAction<string[]>>;
  editRole?: string;
}) {
  const role = editRole ?? '';
  if (role === 'admin' || role === 'master_admin') return null;
  return (
    <div className="space-y-2">
      <Label className="text-sm font-semibold">Acesso à barra lateral</Label>
      <p className="text-xs text-muted-foreground">Itens visíveis para este usuário</p>
      <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto p-2 rounded-md border border-input">
        {NAV_ITEMS_FOR_NON_ADMIN.map((item) => (
          <label key={item.href} className="flex items-center gap-2 cursor-pointer text-sm py-0.5">
            <input
              type="checkbox"
              checked={navItems.includes(item.href)}
              onChange={(e) => {
                setNavItems(prev =>
                  e.target.checked
                    ? [...prev, item.href]
                    : prev.filter(h => h !== item.href)
                );
              }}
              className="rounded"
            />
            {item.label}
          </label>
        ))}
      </div>
    </div>
  );
}

export function UserManagement({
  users,
  sectors,
  currentUserRole,
  allSectors,
  userSectorsMap,
}: {
  users: UserWithSector[];
  sectors: Sector[];
  currentUserRole: string;
  allSectors: { id: string; name: string; icon: string | null }[];
  userSectorsMap: Record<string, { id: string; name: string }[]>;
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

  const [editAvatarFile, setEditAvatarFile] = useState<File | null>(null);
  const [editAvatarPreview, setEditAvatarPreview] = useState<string | null>(null);
  const editAvatarInputRef = useRef<HTMLInputElement>(null);

  const canEditCredentials = currentUserRole === 'admin' || currentUserRole === 'master_admin';

  const [createSectorIds, setCreateSectorIds] = useState<string[]>([]);
  const [editSectorIds, setEditSectorIds] = useState<string[]>([]);
  const [loadingSectors, setLoadingSectors] = useState(false);
  const [navItems, setNavItems] = useState<string[]>(DEFAULT_NAV);

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
    setEditAvatarFile(null);
    setEditAvatarPreview(null);
    setNavItems(user.allowed_nav_items ?? DEFAULT_NAV);
    setEditOpen(true);

    // Carregar setores do usuário
    setLoadingSectors(true);
    const result = await getUserSectorsAction(user.id);
    if ('data' in result) {
      setEditSectorIds(result.data.map((d: { sector_id: string }) => d.sector_id));
    }
    setLoadingSectors(false);
  }

  async function uploadAvatarServerSide(userId: string, file: File): Promise<string | null> {
    const fd = new FormData();
    fd.append('file', file);
    const result = await uploadAndSetUserAvatarAction(userId, fd);
    if ('error' in result && result.error) {
      setError('Erro ao enviar avatar: ' + result.error);
      return null;
    }
    return 'url' in result ? (result.url ?? null) : null;
  }

  async function handleCreate(formData: FormData) {
    setCreating(true);
    setError('');
    try {
      const result = await createUserAction(formData);
      if (result.error) {
        setError(result.error);
        return;
      }

      // Upload avatar if selected (via server action — bypassa RLS)
      if (createAvatarFile && result.userId) {
        const url = await uploadAvatarServerSide(result.userId, createAvatarFile);
        if (!url) return;
      }

      // Salvar setores
      if (result.userId && createSectorIds.length > 0) {
        const sectorsResult = await updateUserSectorsAction(result.userId, createSectorIds);
        if (sectorsResult?.error) {
          setError('Usuário criado, mas erro ao salvar setores: ' + sectorsResult.error);
          return;
        }
      }

      setCreateAvatarFile(null);
      setCreateAvatarPreview(null);
      setCreateSectorIds([]);
      setCreateOpen(false);
      router.refresh();
    } catch (err) {
      console.error('[handleCreate] erro inesperado:', err);
      setError('Erro inesperado ao criar usuário. Tente novamente.');
    } finally {
      setCreating(false);
    }
  }

  async function handleSaveEdit() {
    if (!editUser) return;
    setSaving(true);
    setError('');
    try {
      // Update profile fields
      const data: Record<string, unknown> = {};
      if (editName !== editUser.full_name) data.full_name = editName;
      if (editRole !== editUser.role) data.role = editRole;
      if ((editSector || null) !== editUser.sector_id) data.sector_id = editSector || null;
      if ((editPhone || null) !== editUser.phone) data.phone = editPhone || null;
      if (editStatus !== editUser.status) data.status = editStatus;
      // Sempre salvar allowed_nav_items (admin/master_admin = null)
      const isAdminRole = editRole === 'admin' || editRole === 'master_admin';
      data.allowed_nav_items = isAdminRole ? null : navItems;

      if (Object.keys(data).length > 0) {
        const result = await updateUserAction(editUser.id, data);
        if (result.error) {
          setError(result.error);
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
          return;
        }
      }

      // Atualizar setores
      if (canEditCredentials) {
        const sectorsResult = await updateUserSectorsAction(editUser.id, editSectorIds);
        if (sectorsResult?.error) {
          setError('Erro ao salvar setores: ' + sectorsResult.error);
          return;
        }
      }

      // Upload novo avatar se selecionado (via server action — bypassa RLS)
      if (editAvatarFile) {
        const url = await uploadAvatarServerSide(editUser.id, editAvatarFile);
        if (!url) return;
      }

      setEditAvatarFile(null);
      setEditAvatarPreview(null);
      setEditOpen(false);
      router.refresh();
    } catch (err) {
      console.error('[handleSaveEdit] erro inesperado:', err);
      setError('Erro inesperado ao salvar. Tente novamente.');
    } finally {
      setSaving(false);
    }
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

  function getUserSectors(user: UserWithSector): { id: string; name: string }[] {
    return userSectorsMap[user.id] ?? [];
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

        <Button onClick={() => { setError(''); setNavItems(DEFAULT_NAV); setCreateOpen(true); }}>
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
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
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
            <NavItemsCheckboxSection navItems={navItems} setNavItems={setNavItems} />
            <input type="hidden" name="allowed_nav_items" value={JSON.stringify(navItems)} />
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
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Usuário</DialogTitle>
          </DialogHeader>
          {editUser && (
            <div className="space-y-4">
              {error && editOpen && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
              )}

              {/* Avatar upload */}
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 border border-border">
                <div
                  className="w-16 h-16 rounded-full bg-muted flex items-center justify-center flex-shrink-0 overflow-hidden cursor-pointer"
                  onClick={() => editAvatarInputRef.current?.click()}
                >
                  {editAvatarPreview ? (
                    <img src={editAvatarPreview} alt="preview" className="w-full h-full object-cover" />
                  ) : editUser.avatar_url ? (
                    <img src={editUser.avatar_url} alt={editUser.full_name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-muted-foreground text-2xl">👤</span>
                  )}
                </div>
                <div>
                  <p className="text-xs font-medium mb-1">Foto de perfil</p>
                  <button
                    type="button"
                    className="text-xs px-2.5 py-1 rounded-md border border-input bg-background hover:bg-accent transition-colors"
                    onClick={() => editAvatarInputRef.current?.click()}
                  >
                    {editAvatarPreview ? 'Trocar foto' : editUser.avatar_url ? 'Trocar foto' : 'Selecionar foto'}
                  </button>
                </div>
                <input
                  ref={editAvatarInputRef}
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
                    setEditAvatarFile(file);
                    setEditAvatarPreview(URL.createObjectURL(file));
                    e.target.value = '';
                  }}
                />
              </div>

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

              <NavItemsCheckboxSection navItems={navItems} setNavItems={setNavItems} editRole={editRole} />

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
      <Card className="overflow-hidden overflow-x-auto">
        <table className="w-full text-sm min-w-[600px]">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="text-left p-3 font-medium text-muted-foreground">Usuário</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Perfil</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Setor</th>
              <th className="hidden sm:table-cell text-left p-3 font-medium text-muted-foreground">Status</th>
              <th className="hidden sm:table-cell text-left p-3 font-medium text-muted-foreground">Telefone</th>
              <th className="text-right p-3 font-medium text-muted-foreground sticky right-0 bg-muted/50">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((user) => {
              const userSectors = getUserSectors(user);
              return (
                <tr key={user.id} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
                        {user.avatar_url ? (
                          <img src={user.avatar_url} alt={user.full_name} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-xs font-semibold text-primary">
                            {user.full_name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                          </span>
                        )}
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
                    {userSectors.length === 0 ? (
                      '—'
                    ) : (
                      <div className="flex flex-wrap gap-1 max-w-[220px]">
                        {userSectors.slice(0, 3).map((s) => (
                          <Badge key={s.id} variant="secondary" className="text-[10px] font-normal">
                            {s.name}
                          </Badge>
                        ))}
                        {userSectors.length > 3 && (
                          <Badge variant="outline" className="text-[10px] font-normal">
                            +{userSectors.length - 3}
                          </Badge>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="hidden sm:table-cell p-3">
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
                  <td className="hidden sm:table-cell p-3 text-xs text-muted-foreground">
                    {user.phone || '—'}
                  </td>
                  <td className="p-3 text-right sticky right-0 bg-card">
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
