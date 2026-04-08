'use client';

import { useActionState } from 'react';
import { updateProfileAction } from '../actions/settings-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface ProfileFormProps {
  profile: {
    full_name: string;
    role: string;
    status: string;
  };
  email: string;
}

export function ProfileForm({ profile, email }: ProfileFormProps) {
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
      </CardContent>
    </Card>
  );
}
