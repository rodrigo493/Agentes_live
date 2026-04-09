'use client';

import { useActionState } from 'react';
import { resetPasswordAction } from '@/features/auth/actions/auth-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function ResetPasswordPage() {
  const [state, formAction, isPending] = useActionState(
    async (_prev: { error?: string } | undefined, formData: FormData) => {
      return await resetPasswordAction(formData);
    },
    undefined
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Nova Senha</CardTitle>
          <CardDescription>Digite sua nova senha para acessar o sistema</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-4">
            {state?.error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {state.error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="password">Nova senha</Label>
              <Input
                id="password"
                name="password"
                type="password"
                minLength={8}
                required
                placeholder="Mínimo 8 caracteres"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm_password">Confirmar senha</Label>
              <Input
                id="confirm_password"
                name="confirm_password"
                type="password"
                minLength={8}
                required
                placeholder="Repita a nova senha"
              />
            </div>
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? 'Salvando...' : 'Redefinir senha'}
            </Button>
          </form>
          <div className="mt-4 text-center">
            <a href="/login" className="text-sm text-muted-foreground hover:underline">
              Voltar ao login
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
