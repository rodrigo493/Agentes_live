import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { ProfileForm } from '@/features/settings/components/profile-form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Shield, Bell, Server, Settings } from 'lucide-react';

export default async function SettingsPage() {
  const { user, profile } = await getAuthenticatedUser();

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Settings className="w-6 h-6 text-primary" />
          Configurações
        </h1>
        <p className="text-sm text-muted-foreground">
          Configurações do sistema e segurança
        </p>
      </div>

      {/* Profile Card - editable */}
      <ProfileForm
        profile={{
          full_name: profile.full_name,
          role: profile.role,
          status: profile.status,
        }}
        email={user.email}
      />

      {/* Security Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="w-4 h-4" /> Segurança
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Autenticação 2FA</p>
              <p className="text-xs text-muted-foreground">
                Obrigatório para admin e master_admin
              </p>
            </div>
            <Switch defaultChecked disabled />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Expiração de sessão</p>
              <p className="text-xs text-muted-foreground">
                Tempo de inatividade antes do logout automático
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Input defaultValue="30" className="w-16 h-8 text-center" disabled />
              <span className="text-xs text-muted-foreground">min</span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Rate limiting</p>
              <p className="text-xs text-muted-foreground">
                Limite de requisições por minuto
              </p>
            </div>
            <Switch defaultChecked disabled />
          </div>
        </CardContent>
      </Card>

      {/* Notifications Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="w-4 h-4" /> Notificações
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Alertas de segurança por e-mail</p>
            <Switch defaultChecked disabled />
          </div>
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Notificações de novas mensagens</p>
            <Switch defaultChecked disabled />
          </div>
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Resumo diário por setor</p>
            <Switch disabled />
          </div>
        </CardContent>
      </Card>

      {/* Infrastructure Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Server className="w-4 h-4" /> Infraestrutura
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Domínio</p>
              <p className="text-xs text-muted-foreground">Subdomínio de produção</p>
            </div>
            <Badge variant="outline" className="font-mono text-xs">
              squad.liveuni.com.br
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Ambiente atual</p>
              <p className="text-xs text-muted-foreground">
                Desenvolvimento / Homologação / Produção
              </p>
            </div>
            <Badge className="text-[10px]">Desenvolvimento</Badge>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Backup automático</p>
              <p className="text-xs text-muted-foreground">
                Backup diário do banco de dados
              </p>
            </div>
            <Switch defaultChecked disabled />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
