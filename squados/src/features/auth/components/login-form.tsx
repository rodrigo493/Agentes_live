'use client';

import { useActionState } from 'react';
import { loginAction } from '../actions/auth-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Shield, Mail, Lock, LogIn } from 'lucide-react';

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(
    async (_prev: { error?: string } | undefined, formData: FormData) => {
      return await loginAction(formData);
    },
    undefined
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-sidebar p-4">
      <div className="w-full max-w-md space-y-8">
        {/* Logo */}
        <div className="text-center space-y-2">
          <div className="w-16 h-16 rounded-2xl bg-primary mx-auto flex items-center justify-center shadow-lg">
            <Shield className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold text-primary-foreground">Squad</h1>
          <p className="text-sidebar-foreground/60 text-sm">
            Sistema Operacional Corporativo
          </p>
        </div>

        <Card className="border-sidebar-border bg-card shadow-2xl">
          <CardHeader className="text-center pb-2">
            <h2 className="text-lg font-semibold text-card-foreground">
              Acessar o sistema
            </h2>
            <p className="text-sm text-muted-foreground">
              Insira suas credenciais para continuar
            </p>
          </CardHeader>
          <CardContent>
            <form action={formAction} className="space-y-5">
              {state?.error && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {state.error}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium">
                  E-mail corporativo
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="voce@empresa.com.br"
                    required
                    autoComplete="email"
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium">
                  Senha
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    placeholder="••••••••"
                    required
                    autoComplete="current-password"
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    name="remember"
                    className="rounded border-border"
                  />
                  <span className="text-muted-foreground">Lembrar de mim</span>
                </label>
                <a
                  href="/forgot-password"
                  className="text-primary hover:underline font-medium"
                >
                  Esqueceu a senha?
                </a>
              </div>

              <Button
                type="submit"
                className="w-full h-11 font-semibold"
                disabled={isPending}
              >
                {isPending ? (
                  'Entrando...'
                ) : (
                  <>
                    <LogIn className="w-4 h-4 mr-2" />
                    Entrar
                  </>
                )}
              </Button>

              <p className="text-center text-xs text-muted-foreground">
                Plataforma protegida por autenticação segura.
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
