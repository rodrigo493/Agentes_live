'use client';

import { useActionState } from 'react';
import { forgotPasswordAction } from '@/features/auth/actions/auth-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function ForgotPasswordPage() {
  const [state, formAction, isPending] = useActionState(
    async (_prev: { error?: string; success?: boolean } | undefined, formData: FormData) => {
      return await forgotPasswordAction(formData);
    },
    undefined
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Recuperar Senha</CardTitle>
          <CardDescription>Informe seu email para receber o link de recuperação</CardDescription>
        </CardHeader>
        <CardContent>
          {state?.success ? (
            <div className="rounded-md bg-green-50 p-3 text-sm text-green-700">
              Email de recuperação enviado. Verifique sua caixa de entrada.
            </div>
          ) : (
            <form action={formAction} className="space-y-4">
              {state?.error && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {state.error}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" required />
              </div>
              <Button type="submit" className="w-full" disabled={isPending}>
                {isPending ? 'Enviando...' : 'Enviar link de recuperação'}
              </Button>
            </form>
          )}
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
