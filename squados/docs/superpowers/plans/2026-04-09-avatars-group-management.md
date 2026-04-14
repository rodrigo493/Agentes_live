# Avatares e Gestão de Grupos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir upload de foto de perfil (Settings + criação de usuário) e adicionar gestão completa de grupos no workspace (imagem, editar nome/descrição, adicionar/remover membros).

**Architecture:** Upload client-side via Supabase Storage SDK (File não é serializável em server actions). Após upload, URL pública é salva em `profiles.avatar_url` ou `groups.avatar_url` via server action. Grupos têm modal de edição com 2 abas (Informações / Membros) acessível via botão no header do chat.

**Tech Stack:** Next.js 15 App Router, Supabase Storage (`@supabase/ssr`), Tailwind CSS, shadcn/base-ui components

---

## File Map

**Novos arquivos:**
- `supabase/migrations/00017_create_storage_buckets.sql`
- `src/features/settings/components/avatar-upload.tsx`
- `src/features/workspace/components/group-avatar-upload.tsx`
- `src/features/workspace/components/edit-group-modal.tsx`
- `src/features/workspace/actions/group-actions.ts`

**Arquivos modificados:**
- `src/features/settings/actions/settings-actions.ts` — add `updateAvatarAction`
- `src/features/settings/components/profile-form.tsx` — add `AvatarUpload`
- `src/app/(app)/settings/page.tsx` — pass `avatar_url` e `userId` ao ProfileForm
- `src/features/users/components/user-management.tsx` — foto opcional na criação
- `src/app/(app)/workspace/page.tsx` — incluir `avatar_url` na query de grupos
- `src/features/workspace/components/workspace-shell.tsx` — avatar nos grupos, botão editar, EditGroupModal
- `src/app/api/workspace/groups/route.ts` — aceitar `avatar_url` no body

---

## Task 1: Migration — Supabase Storage Buckets

**Files:**
- Create: `squados/supabase/migrations/00017_create_storage_buckets.sql`

- [ ] **Step 1: Criar migration SQL**

```sql
-- supabase/migrations/00017_create_storage_buckets.sql

-- Bucket para avatares de usuários (público)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  2097152,
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
) ON CONFLICT (id) DO NOTHING;

-- Bucket para imagens de grupos (público)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'group-avatars',
  'group-avatars',
  true,
  2097152,
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
) ON CONFLICT (id) DO NOTHING;

-- Leitura pública: avatares
CREATE POLICY "Public read avatars"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'avatars');

-- Upload/update/delete: cada usuário só acessa seu próprio folder
CREATE POLICY "Users manage own avatar"
  ON storage.objects FOR ALL TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Leitura pública: group-avatars
CREATE POLICY "Public read group avatars"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'group-avatars');

-- Upload/update/delete group-avatars: somente admin e master_admin
CREATE POLICY "Admins manage group avatars"
  ON storage.objects FOR ALL TO authenticated
  USING (
    bucket_id = 'group-avatars'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'master_admin')
    )
  )
  WITH CHECK (
    bucket_id = 'group-avatars'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'master_admin')
    )
  );
```

- [ ] **Step 2: Aplicar no Supabase**

Execute via SQL Editor no Supabase Dashboard ou:
```bash
supabase db push
```

- [ ] **Step 3: Verificar buckets criados**

No Supabase Dashboard → Storage → deve aparecer `avatars` e `group-avatars` como públicos.

- [ ] **Step 4: Commit**

```bash
git add squados/supabase/migrations/00017_create_storage_buckets.sql
git commit -m "feat: create avatars and group-avatars storage buckets"
```

---

## Task 2: Componente AvatarUpload (reutilizável para usuários)

**Files:**
- Create: `squados/src/features/settings/components/avatar-upload.tsx`

- [ ] **Step 1: Criar o componente**

```tsx
// src/features/settings/components/avatar-upload.tsx
'use client';

import { useRef, useState } from 'react';
import { createClient } from '@/shared/lib/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Camera, Trash2 } from 'lucide-react';

interface AvatarUploadProps {
  currentUrl: string | null;
  userId: string;
  name: string;
  onUpload: (url: string | null) => Promise<void>;
}

function getInitials(name: string) {
  return name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
}

export function AvatarUpload({ currentUrl, userId, name, onUpload }: AvatarUploadProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  const displayUrl = preview ?? currentUrl;

  async function handleFile(file: File) {
    if (file.size > 2 * 1024 * 1024) {
      setError('Arquivo muito grande. Máximo 2 MB.');
      return;
    }
    setError('');
    setUploading(true);
    setPreview(URL.createObjectURL(file));

    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `${userId}/${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true });

    if (uploadError) {
      setPreview(null);
      setError('Erro ao enviar imagem. Tente novamente.');
      setUploading(false);
      return;
    }

    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    await onUpload(data.publicUrl);
    setUploading(false);
  }

  async function handleRemove() {
    setPreview(null);
    setError('');
    await onUpload(null);
  }

  return (
    <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/40 border border-border">
      <Avatar className="h-16 w-16 flex-shrink-0">
        {displayUrl && <AvatarImage src={displayUrl} alt={name} />}
        <AvatarFallback className="text-lg bg-primary/10 text-primary">
          {getInitials(name)}
        </AvatarFallback>
      </Avatar>

      <div className="flex flex-col gap-2 min-w-0">
        <span className="text-sm font-medium">Foto de perfil</span>
        <div className="flex gap-2 flex-wrap">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
          >
            <Camera className="w-3.5 h-3.5 mr-1.5" />
            {uploading ? 'Enviando...' : 'Trocar foto'}
          </Button>
          {displayUrl && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRemove}
              disabled={uploading}
              className="text-destructive border-destructive/30 hover:bg-destructive/10"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <p className="text-xs text-muted-foreground">JPG, PNG ou GIF · máx 2 MB</p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verificar build**

```bash
cd squados && npm run build 2>&1 | grep -E "error|warning" | head -20
```

Esperado: sem erros em `avatar-upload.tsx`.

- [ ] **Step 3: Commit**

```bash
git add squados/src/features/settings/components/avatar-upload.tsx
git commit -m "feat: add AvatarUpload component for user profile pictures"
```

---

## Task 3: updateAvatarAction + Settings integrado

**Files:**
- Modify: `squados/src/features/settings/actions/settings-actions.ts`
- Modify: `squados/src/features/settings/components/profile-form.tsx`
- Modify: `squados/src/app/(app)/settings/page.tsx`

- [ ] **Step 1: Adicionar `updateAvatarAction` em `settings-actions.ts`**

Adicione ao final do arquivo (após `updateProfileAction`):

```ts
export async function updateAvatarAction(avatarUrl: string | null) {
  const { user } = await getAuthenticatedUser();

  const admin = createAdminClient();
  const { error } = await admin
    .from('profiles')
    .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
    .eq('id', user.id);

  if (error) return { error: 'Erro ao atualizar foto de perfil' };

  revalidatePath('/settings');
  revalidatePath('/workspace');
  return { success: true };
}
```

- [ ] **Step 2: Atualizar `ProfileFormProps` e integrar `AvatarUpload`**

Substitua o conteúdo de `profile-form.tsx`:

```tsx
// src/features/settings/components/profile-form.tsx
'use client';

import { useActionState } from 'react';
import { updateProfileAction, updateAvatarAction } from '../actions/settings-actions';
import { AvatarUpload } from './avatar-upload';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface ProfileFormProps {
  profile: {
    full_name: string;
    role: string;
    status: string;
    sector_id: string | null;
    avatar_url: string | null;
  };
  email: string;
  userId: string;
  isAdmin?: boolean;
  sectors?: { id: string; name: string }[];
}

export function ProfileForm({ profile, email, userId, isAdmin = false, sectors = [] }: ProfileFormProps) {
  const [state, formAction, isPending] = useActionState(
    async (_prev: { error?: string; success?: boolean } | undefined, formData: FormData) => {
      return await updateProfileAction(formData);
    },
    undefined
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Meu Perfil</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Avatar upload */}
          <AvatarUpload
            currentUrl={profile.avatar_url}
            userId={userId}
            name={profile.full_name}
            onUpload={async (url) => {
              await updateAvatarAction(url);
            }}
          />

          <form action={formAction} className="space-y-4">
            {state?.error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {state.error}
              </div>
            )}
            {state?.success && (
              <div className="rounded-md bg-green-50 p-3 text-sm text-green-700">
                Perfil atualizado com sucesso!
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="full_name">Nome</Label>
              <Input
                id="full_name"
                name="full_name"
                defaultValue={profile.full_name}
                required
                minLength={2}
              />
            </div>

            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={email} disabled className="bg-muted" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="sector_id">Setor</Label>
              {isAdmin ? (
                <select
                  name="sector_id"
                  id="sector_id"
                  defaultValue={profile.sector_id ?? ''}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Selecione um setor</option>
                  {sectors.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              ) : (
                <Input
                  value={sectors.find((s) => s.id === profile.sector_id)?.name ?? 'Nenhum'}
                  disabled
                  className="bg-muted"
                />
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Cargo</Label>
                <Input
                  value={profile.role.replace('_', ' ')}
                  disabled
                  className="bg-muted capitalize"
                />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Input
                  value={profile.status}
                  disabled
                  className="bg-muted capitalize"
                />
              </div>
            </div>

            <Button type="submit" disabled={isPending}>
              {isPending ? 'Salvando...' : 'Salvar Alterações'}
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Atualizar `settings/page.tsx` para passar `avatar_url` e `userId`**

Localize e substitua o trecho do `<ProfileForm .../>`:

```tsx
      <ProfileForm
        profile={{
          full_name: profile.full_name,
          role: profile.role,
          status: profile.status,
          sector_id: profile.sector_id,
          avatar_url: profile.avatar_url,
        }}
        email={user.email}
        userId={user.id}
        isAdmin={userIsAdmin}
        sectors={sectors}
      />
```

- [ ] **Step 4: Verificar build**

```bash
cd squados && npm run build 2>&1 | grep -E "error" | head -20
```

Esperado: sem erros.

- [ ] **Step 5: Commit**

```bash
git add squados/src/features/settings/actions/settings-actions.ts \
        squados/src/features/settings/components/profile-form.tsx \
        squados/src/app/\(app\)/settings/page.tsx
git commit -m "feat: avatar upload in settings profile form"
```

---

## Task 4: Avatar na criação de usuário (admin)

**Files:**
- Modify: `squados/src/features/users/components/user-management.tsx`

- [ ] **Step 1: Adicionar `updateUserAvatarAction` em `user-actions.ts`**

Adicione ao final do arquivo:

```ts
export async function updateUserAvatarAction(userId: string, avatarUrl: string) {
  const { profile } = await requirePermission('users', 'manage');

  if (profile.role !== 'admin' && profile.role !== 'master_admin') {
    return { error: 'Sem permissão' };
  }

  const adminClient = createAdminClient();
  const { error } = await adminClient
    .from('profiles')
    .update({ avatar_url: avatarUrl })
    .eq('id', userId);

  if (error) return { error: error.message };
  return { success: true };
}
```

- [ ] **Step 2: Adicionar imports e estado de avatar no `UserManagement`**

No topo do arquivo, adicione os imports faltantes:

```tsx
import { useRef } from 'react';
import { createClient } from '@/shared/lib/supabase/client';
import { updateUserAvatarAction } from '../actions/user-actions';
```

Dentro do componente, adicione após `const [saving, setSaving] = useState(false);`:

```tsx
  const [createAvatarFile, setCreateAvatarFile] = useState<File | null>(null);
  const [createAvatarPreview, setCreateAvatarPreview] = useState<string | null>(null);
  const createAvatarInputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();
```

- [ ] **Step 3: Adicionar função de upload após criação**

Adicione antes de `handleCreate`:

```tsx
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
```

- [ ] **Step 4: Atualizar `handleCreate` para fazer upload após criar usuário**

Substitua a função `handleCreate`:

```tsx
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

    setCreateAvatarFile(null);
    setCreateAvatarPreview(null);
    setCreateOpen(false);
    router.refresh();
    setCreating(false);
  }
```

- [ ] **Step 5: Adicionar campo de avatar no dialog de criação**

No `<Dialog open={createOpen}>` → `<form>`, adicione ANTES do campo `full_name`:

```tsx
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
```

- [ ] **Step 6: Limpar estado ao fechar dialog**

Altere o `onOpenChange` do Dialog de criação:

```tsx
      <Dialog open={createOpen} onOpenChange={(open) => {
        if (!open) {
          setCreateAvatarFile(null);
          setCreateAvatarPreview(null);
          setError('');
        }
        setCreateOpen(open);
      }}>
```

- [ ] **Step 7: Verificar build**

```bash
cd squados && npm run build 2>&1 | grep -E "error" | head -20
```

- [ ] **Step 8: Commit**

```bash
git add squados/src/features/users/components/user-management.tsx \
        squados/src/features/users/actions/user-actions.ts
git commit -m "feat: optional avatar upload in user creation form"
```

---

## Task 5: Server actions para gestão de grupos

**Files:**
- Create: `squados/src/features/workspace/actions/group-actions.ts`

- [ ] **Step 1: Criar o arquivo de actions**

```ts
// src/features/workspace/actions/group-actions.ts
'use server';

import { createAdminClient } from '@/shared/lib/supabase/admin';
import { requirePermission } from '@/shared/lib/rbac/guards';

export async function updateGroupAction(
  groupId: string,
  data: { name?: string; description?: string | null; avatar_url?: string | null }
) {
  await requirePermission('groups', 'manage');

  const admin = createAdminClient();
  const { error } = await admin
    .from('groups')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', groupId);

  if (error) return { error: error.message };

  // Sync conversation title if name changed
  if (data.name) {
    await admin
      .from('conversations')
      .update({ title: data.name })
      .eq('group_id', groupId);
  }

  return { success: true };
}

export async function getGroupMembersAction(groupId: string) {
  await requirePermission('groups', 'read');

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('group_members')
    .select('user_id, role, joined_at, profiles!user_id(id, full_name, avatar_url, role)')
    .eq('group_id', groupId)
    .order('joined_at', { ascending: true });

  if (error) return { error: error.message, data: [] };
  return { data: data ?? [] };
}

export async function addGroupMemberAction(groupId: string, userId: string) {
  await requirePermission('groups', 'manage');

  const admin = createAdminClient();

  // Add to group_members
  const { error } = await admin
    .from('group_members')
    .insert({ group_id: groupId, user_id: userId, role: 'member' });

  if (error) return { error: error.message };

  // Add to conversation participant_ids
  const { data: conv } = await admin
    .from('conversations')
    .select('id, participant_ids')
    .eq('group_id', groupId)
    .single();

  if (conv && !conv.participant_ids.includes(userId)) {
    await admin
      .from('conversations')
      .update({ participant_ids: [...conv.participant_ids, userId] })
      .eq('id', conv.id);
  }

  return { success: true };
}

export async function removeGroupMemberAction(groupId: string, userId: string) {
  await requirePermission('groups', 'manage');

  const admin = createAdminClient();

  // Remove from group_members
  const { error } = await admin
    .from('group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', userId);

  if (error) return { error: error.message };

  // Remove from conversation participant_ids
  const { data: conv } = await admin
    .from('conversations')
    .select('id, participant_ids')
    .eq('group_id', groupId)
    .single();

  if (conv) {
    await admin
      .from('conversations')
      .update({
        participant_ids: conv.participant_ids.filter((id: string) => id !== userId),
      })
      .eq('id', conv.id);
  }

  return { success: true };
}
```

- [ ] **Step 2: Verificar build**

```bash
cd squados && npm run build 2>&1 | grep -E "error" | head -20
```

- [ ] **Step 3: Commit**

```bash
git add squados/src/features/workspace/actions/group-actions.ts
git commit -m "feat: server actions for group management (update, members)"
```

---

## Task 6: Modal de edição de grupo

**Files:**
- Create: `squados/src/features/workspace/components/edit-group-modal.tsx`

- [ ] **Step 1: Criar o componente**

```tsx
// src/features/workspace/components/edit-group-modal.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/shared/lib/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Camera, UserPlus, X } from 'lucide-react';
import {
  updateGroupAction,
  getGroupMembersAction,
  addGroupMemberAction,
  removeGroupMemberAction,
} from '../actions/group-actions';

interface GroupInfo {
  id: string;
  name: string;
  description: string | null;
  status: string;
  avatar_url: string | null;
}

interface Contact {
  id: string;
  full_name: string;
  avatar_url: string | null;
  role: string;
}

interface GroupMember {
  user_id: string;
  role: string;
  profiles: {
    id: string;
    full_name: string;
    avatar_url: string | null;
    role: string;
  };
}

interface EditGroupModalProps {
  group: GroupInfo;
  contacts: Contact[];
  open: boolean;
  onClose: () => void;
  onGroupUpdated: (updated: Pick<GroupInfo, 'name' | 'description' | 'avatar_url'>) => void;
}

function getInitials(name: string) {
  return name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
}

export function EditGroupModal({
  group,
  contacts,
  open,
  onClose,
  onGroupUpdated,
}: EditGroupModalProps) {
  const supabase = createClient();
  const [tab, setTab] = useState<'info' | 'members'>('info');

  // Info tab
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description ?? '');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(group.avatar_url);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [savingInfo, setSavingInfo] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Members tab
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [addingMember, setAddingMember] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const [error, setError] = useState('');

  // Reset state when group changes
  useEffect(() => {
    setName(group.name);
    setDescription(group.description ?? '');
    setAvatarUrl(group.avatar_url);
    setAvatarPreview(null);
    setAvatarFile(null);
    setMembers([]);
    setTab('info');
    setError('');
  }, [group.id]);

  // Load members when switching to members tab
  useEffect(() => {
    if (tab === 'members' && open && members.length === 0) {
      loadMembers();
    }
  }, [tab, open]);

  async function loadMembers() {
    setLoadingMembers(true);
    const result = await getGroupMembersAction(group.id);
    if ('data' in result) {
      setMembers(result.data as GroupMember[]);
    }
    setLoadingMembers(false);
  }

  function handleAvatarFile(file: File) {
    if (file.size > 2 * 1024 * 1024) {
      setError('Arquivo muito grande. Máximo 2 MB.');
      return;
    }
    setError('');
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  }

  async function handleSaveInfo() {
    if (!name.trim()) return;
    setSavingInfo(true);
    setError('');

    let finalAvatarUrl = avatarUrl;

    if (avatarFile) {
      const ext = avatarFile.name.split('.').pop() ?? 'jpg';
      const path = `${group.id}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('group-avatars')
        .upload(path, avatarFile, { upsert: true });

      if (!uploadError) {
        const { data } = supabase.storage.from('group-avatars').getPublicUrl(path);
        finalAvatarUrl = data.publicUrl;
      } else {
        setError('Erro ao enviar imagem. As outras alterações serão salvas.');
      }
    }

    const result = await updateGroupAction(group.id, {
      name: name.trim(),
      description: description.trim() || null,
      avatar_url: finalAvatarUrl,
    });

    if (result.error) {
      setError(result.error);
    } else {
      setAvatarUrl(finalAvatarUrl);
      setAvatarFile(null);
      setAvatarPreview(null);
      onGroupUpdated({
        name: name.trim(),
        description: description.trim() || null,
        avatar_url: finalAvatarUrl,
      });
    }
    setSavingInfo(false);
  }

  async function handleAddMember(userId: string) {
    setAddingMember(true);
    setError('');
    const result = await addGroupMemberAction(group.id, userId);
    if (result.error) {
      setError(result.error);
    } else {
      await loadMembers();
      setMemberSearch('');
    }
    setAddingMember(false);
  }

  async function handleRemoveMember(userId: string) {
    setRemovingId(userId);
    setError('');
    const result = await removeGroupMemberAction(group.id, userId);
    if (result.error) {
      setError(result.error);
    } else {
      setMembers((prev) => prev.filter((m) => m.user_id !== userId));
    }
    setRemovingId(null);
  }

  const memberIds = new Set(members.map((m) => m.user_id));
  const availableContacts = contacts.filter(
    (c) =>
      !memberIds.has(c.id) &&
      c.full_name.toLowerCase().includes(memberSearch.toLowerCase())
  );
  const displayAvatar = avatarPreview ?? avatarUrl;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Editar Grupo</DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex border-b border-border -mx-6 px-6 flex-shrink-0">
          <button
            onClick={() => setTab('info')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === 'info'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Informações
          </button>
          <button
            onClick={() => setTab('members')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === 'members'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Membros
          </button>
        </div>

        {error && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive flex-shrink-0">
            {error}
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {/* ── Info tab ── */}
          {tab === 'info' && (
            <div className="space-y-4 py-2">
              {/* Group image */}
              <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/40 border border-border">
                <div className="w-14 h-14 rounded-lg overflow-hidden bg-violet-500/10 flex items-center justify-center flex-shrink-0">
                  {displayAvatar ? (
                    <img
                      src={displayAvatar}
                      alt={name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-violet-500 text-xl font-bold">#</span>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium">Imagem do grupo</span>
                  <label className="cursor-pointer">
                    <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border border-input bg-background hover:bg-accent transition-colors">
                      <Camera className="w-3 h-3" />
                      Trocar imagem
                    </span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/gif,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleAvatarFile(file);
                        e.target.value = '';
                      }}
                    />
                  </label>
                  <p className="text-xs text-muted-foreground">JPG, PNG, GIF · máx 2 MB</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Nome do grupo</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nome do grupo"
                />
              </div>

              <div className="space-y-2">
                <Label>
                  Descrição{' '}
                  <span className="text-muted-foreground text-xs">(opcional)</span>
                </Label>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Descrição do grupo"
                />
              </div>

              <Button
                onClick={handleSaveInfo}
                disabled={savingInfo || !name.trim()}
                className="w-full"
              >
                {savingInfo ? 'Salvando...' : 'Salvar Informações'}
              </Button>
            </div>
          )}

          {/* ── Members tab ── */}
          {tab === 'members' && (
            <div className="space-y-3 py-2">
              {loadingMembers ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  Carregando membros...
                </p>
              ) : (
                <>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                      {members.length} membro{members.length !== 1 ? 's' : ''}
                    </p>
                    <div className="space-y-1.5">
                      {members.map((m) => {
                        const p = m.profiles;
                        const isCreator = m.role === 'admin';
                        return (
                          <div
                            key={m.user_id}
                            className="flex items-center justify-between p-2 rounded-md bg-muted/50"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <Avatar className="h-7 w-7 flex-shrink-0">
                                {p.avatar_url && <AvatarImage src={p.avatar_url} />}
                                <AvatarFallback className="text-[10px]">
                                  {getInitials(p.full_name)}
                                </AvatarFallback>
                              </Avatar>
                              <span className="text-sm truncate">{p.full_name}</span>
                              {isCreator && (
                                <span className="text-[10px] text-muted-foreground flex-shrink-0">
                                  (criador)
                                </span>
                              )}
                            </div>
                            {!isCreator && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 flex-shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => handleRemoveMember(m.user_id)}
                                disabled={removingId === m.user_id}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Add member */}
                  <div className="border-t border-border pt-3">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                      Adicionar membro
                    </p>
                    <Input
                      placeholder="Buscar usuário..."
                      value={memberSearch}
                      onChange={(e) => setMemberSearch(e.target.value)}
                      className="mb-2"
                    />
                    <ScrollArea className="h-36">
                      <div className="space-y-1 pr-2">
                        {availableContacts.map((c) => (
                          <div
                            key={c.id}
                            className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <Avatar className="h-6 w-6 flex-shrink-0">
                                {c.avatar_url && <AvatarImage src={c.avatar_url} />}
                                <AvatarFallback className="text-[9px]">
                                  {getInitials(c.full_name)}
                                </AvatarFallback>
                              </Avatar>
                              <span className="text-sm truncate">{c.full_name}</span>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 flex-shrink-0"
                              onClick={() => handleAddMember(c.id)}
                              disabled={addingMember}
                            >
                              <UserPlus className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                        {availableContacts.length === 0 && (
                          <p className="text-xs text-muted-foreground text-center py-3">
                            {memberSearch
                              ? 'Nenhum usuário encontrado.'
                              : 'Todos os usuários já são membros.'}
                          </p>
                        )}
                      </div>
                    </ScrollArea>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verificar build**

```bash
cd squados && npm run build 2>&1 | grep -E "error" | head -20
```

- [ ] **Step 3: Commit**

```bash
git add squados/src/features/workspace/components/edit-group-modal.tsx
git commit -m "feat: EditGroupModal with info and members tabs"
```

---

## Task 7: Workspace — grupos com avatar + edição integrada

**Files:**
- Modify: `squados/src/app/(app)/workspace/page.tsx`
- Modify: `squados/src/app/api/workspace/groups/route.ts`
- Modify: `squados/src/features/workspace/components/workspace-shell.tsx`

- [ ] **Step 1: Atualizar query de grupos em `workspace/page.tsx`**

Altere o select de grupos para incluir `avatar_url`:

```tsx
  const { data: groups } = await admin
    .from('groups')
    .select('id, name, description, status, avatar_url')
    .eq('status', 'active');
```

- [ ] **Step 2: Atualizar a interface `GroupInfo` e o estado no `workspace-shell.tsx`**

Localize a interface `GroupInfo` e adicione `avatar_url`:

```tsx
interface GroupInfo {
  id: string;
  name: string;
  description: string | null;
  status: string;
  avatar_url: string | null;
}
```

- [ ] **Step 3: Adicionar estado e handler do EditGroupModal no `workspace-shell.tsx`**

Adicione após `const [creatingGroup, setCreatingGroup] = useState(false);`:

```tsx
  const [editGroupOpen, setEditGroupOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<GroupInfo | null>(null);
```

Adicione o handler de atualização do grupo:

```tsx
  function handleGroupUpdated(
    groupId: string,
    updated: Pick<GroupInfo, 'name' | 'description' | 'avatar_url'>
  ) {
    setGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, ...updated } : g))
    );
    // Update active chat title if the edited group is open
    setActiveChat((prev) =>
      prev && prev.type === 'group' && prev.conversationId
        ? { ...prev, title: updated.name }
        : prev
    );
    // Update conversation title in list
    setConversations((prev) =>
      prev.map((c) =>
        c.type === 'group' && c.group_id === groupId
          ? { ...c, title: updated.name }
          : c
      )
    );
  }
```

- [ ] **Step 4: Adicionar import e renderização do `EditGroupModal`**

Adicione o import no topo do arquivo:

```tsx
import { EditGroupModal } from './edit-group-modal';
import { Pencil } from 'lucide-react';
```

Adicione o `EditGroupModal` no JSX, antes do fechamento do `<div className="flex h-[calc(100vh-4rem)]">`:

```tsx
      {editingGroup && (
        <EditGroupModal
          group={editingGroup}
          contacts={contacts}
          open={editGroupOpen}
          onClose={() => { setEditGroupOpen(false); setEditingGroup(null); }}
          onGroupUpdated={(updated) => handleGroupUpdated(editingGroup.id, updated)}
        />
      )}
```

- [ ] **Step 5: Adicionar botão "Editar" no header do chat de grupo**

Localize o bloco do chat header e adicione o botão (somente para admin):

```tsx
            {/* Chat header */}
            <div className="border-b border-border px-4 py-3 flex items-center gap-3">
              {activeChat.type === 'dm' ? (
                <User className="w-5 h-5 text-muted-foreground" />
              ) : (
                <Users className="w-5 h-5 text-muted-foreground" />
              )}
              <h2 className="font-semibold flex-1">{activeChat.title}</h2>
              <Badge variant="outline" className="text-[10px]">
                {activeChat.type === 'dm' ? 'Mensagem direta' : 'Grupo'}
              </Badge>
              {activeChat.type === 'group' && isAdmin && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs gap-1.5"
                  onClick={() => {
                    const group = groups.find(
                      (g) => conversations.find((c) => c.group_id === g.id && c.id === activeChat.conversationId)
                    );
                    if (group) {
                      setEditingGroup(group);
                      setEditGroupOpen(true);
                    }
                  }}
                >
                  <Pencil className="h-3 w-3" />
                  Editar
                </Button>
              )}
            </div>
```

- [ ] **Step 6: Exibir avatar do grupo na sidebar**

No bloco de renderização dos grupos na sidebar, substitua o ícone `#` fixo por avatar condicional:

```tsx
            {groups.map((group) => {
              const groupConv = conversations.find(
                (c) => c.type === 'group' && c.group_id === group.id
              );
              const unread = groupConv ? (unreadCounts[groupConv.id] ?? 0) : 0;
              return (
                <button
                  key={group.id}
                  onClick={() => openGroup(group)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 transition-colors text-left ${
                    activeChat?.title === group.name && activeChat?.type === 'group'
                      ? 'bg-muted'
                      : ''
                  }`}
                >
                  <div className="h-8 w-8 rounded-lg bg-violet-500/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {group.avatar_url ? (
                      <img
                        src={group.avatar_url}
                        alt={group.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Hash className="w-3.5 h-3.5 text-violet-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className={`text-sm truncate ${unread > 0 ? 'font-bold' : 'font-medium'}`}>
                        {group.name}
                      </span>
                      {unread > 0 && (
                        <span className="flex-shrink-0 min-w-[18px] h-[18px] rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center px-1">
                          {unread > 99 ? '99+' : unread}
                        </span>
                      )}
                    </div>
                    {group.description && (
                      <p className="text-[11px] text-muted-foreground truncate">{group.description}</p>
                    )}
                  </div>
                </button>
              );
            })}
```

- [ ] **Step 7: Suportar avatar_url na criação de grupo (API route)**

Em `src/app/api/workspace/groups/route.ts`, atualize o destructuring e o insert:

```ts
  const { name, description, member_ids, avatar_url } = await req.json();

  // ...

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
```

- [ ] **Step 8: Adicionar upload de imagem no modal de criação de grupo no workspace-shell**

No estado do `workspace-shell.tsx`, adicione:

```tsx
  const [createGroupAvatarFile, setCreateGroupAvatarFile] = useState<File | null>(null);
  const [createGroupAvatarPreview, setCreateGroupAvatarPreview] = useState<string | null>(null);
```

Atualize `handleCreateGroup` para fazer upload após criar grupo:

```tsx
  async function handleCreateGroup() {
    if (!groupName.trim() || selectedMembers.length === 0) return;
    setCreatingGroup(true);

    const res = await fetch('/api/workspace/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: groupName.trim(),
        description: groupDesc.trim() || null,
        member_ids: selectedMembers,
      }),
    });

    const data = await res.json();
    if (data.group && data.conversation) {
      // Upload avatar if selected
      let avatarUrl: string | null = null;
      if (createGroupAvatarFile) {
        const ext = createGroupAvatarFile.name.split('.').pop() ?? 'jpg';
        const path = `${data.group.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('group-avatars')
          .upload(path, createGroupAvatarFile, { upsert: true });
        if (!upErr) {
          const { data: urlData } = supabase.storage.from('group-avatars').getPublicUrl(path);
          avatarUrl = urlData.publicUrl;
          // Save URL to group
          await fetch('/api/workspace/groups', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ groupId: data.group.id, avatar_url: avatarUrl }),
          });
        }
      }

      setGroups((prev) => [...prev, { ...data.group, avatar_url: avatarUrl }]);
      setConversations((prev) => sortByLastMessage([data.conversation, ...prev]));
      setCreateGroupOpen(false);
      setGroupName('');
      setGroupDesc('');
      setSelectedMembers([]);
      setCreateGroupAvatarFile(null);
      setCreateGroupAvatarPreview(null);
    }

    setCreatingGroup(false);
  }
```

**Nota:** Para simplificar, usamos `updateGroupAction` diretamente em vez de uma rota PUT separada. Substitua o bloco do fetch PUT pelo server action:

```tsx
          // Save URL to group
          const { updateGroupAction } = await import('../actions/group-actions');
          await updateGroupAction(data.group.id, { avatar_url: avatarUrl });
```

No dialog de criação de grupo, adicione antes do campo "Nome do grupo":

```tsx
                    {/* Imagem do grupo */}
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 border border-border">
                      <div
                        className="w-12 h-12 rounded-lg bg-violet-500/10 flex items-center justify-center flex-shrink-0 overflow-hidden cursor-pointer"
                        onClick={() => document.getElementById('group-avatar-input')?.click()}
                      >
                        {createGroupAvatarPreview ? (
                          <img src={createGroupAvatarPreview} alt="preview" className="w-full h-full object-cover" />
                        ) : (
                          <Hash className="w-5 h-5 text-violet-500" />
                        )}
                      </div>
                      <div>
                        <p className="text-xs font-medium mb-1">
                          Imagem <span className="text-muted-foreground">(opcional)</span>
                        </p>
                        <label className="cursor-pointer">
                          <span className="text-xs px-2.5 py-1 rounded-md border border-input bg-background hover:bg-accent transition-colors">
                            Selecionar
                          </span>
                          <input
                            id="group-avatar-input"
                            type="file"
                            accept="image/jpeg,image/png,image/gif,image/webp"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              if (file.size > 2 * 1024 * 1024) return;
                              setCreateGroupAvatarFile(file);
                              setCreateGroupAvatarPreview(URL.createObjectURL(file));
                              e.target.value = '';
                            }}
                          />
                        </label>
                      </div>
                    </div>
```

- [ ] **Step 9: Verificar build**

```bash
cd squados && npm run build 2>&1 | grep -E "error" | head -20
```

- [ ] **Step 10: Commit final**

```bash
git add squados/src/app/\(app\)/workspace/page.tsx \
        squados/src/app/api/workspace/groups/route.ts \
        squados/src/features/workspace/components/workspace-shell.tsx
git commit -m "feat: group avatar display, edit button in header, group creation with image"
```

---

## Task 8: Commit e push final

- [ ] **Step 1: Push para origin**

```bash
git push origin main
```

- [ ] **Step 2: Aplicar migration no Supabase de produção**

No Supabase Dashboard do projeto de produção, abra o SQL Editor e execute o conteúdo de `supabase/migrations/00017_create_storage_buckets.sql`.

---

## Self-Review

**Cobertura do spec:**
- ✅ Avatar upload em Settings
- ✅ Avatar upload na criação de usuário
- ✅ Imagem de grupo na criação
- ✅ Exibição de avatar de grupo na sidebar
- ✅ Botão "Editar grupo" no header (admin+)
- ✅ Modal edição: aba Informações (nome, descrição, imagem)
- ✅ Modal edição: aba Membros (listar, adicionar, remover)
- ✅ Somente admin/master_admin edita grupos
- ✅ Storage buckets com RLS correto

**Consistência de tipos:**
- `GroupInfo` tem `avatar_url: string | null` em todos os usos
- `EditGroupModal.onGroupUpdated` recebe `Pick<GroupInfo, 'name' | 'description' | 'avatar_url'>` — consistente com `handleGroupUpdated`
- `GroupMember.profiles` é tipado identicamente em `group-actions.ts` e `edit-group-modal.tsx`
