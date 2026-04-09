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
