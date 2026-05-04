import {
  LayoutDashboard,
  MessageSquare,
  Bot,
  Building2,
  FolderOpen,
  FileText,
  Brain,
  Shield,
  Users,
  UsersRound,
  Settings,
  BarChart3,
  Mic,
  Eye,
  Factory,
  Mail,
  Workflow,
  CalendarDays,
  ClipboardList,
  BookOpen,
  TrendingUp,
  Target,
  Crosshair,
  PackageCheck,
  AlertTriangle,
} from 'lucide-react';
import type { UserRole } from '@/shared/types/database';

export interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  minRole: UserRole;
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, minRole: 'viewer' },
  { label: 'Workspace', href: '/workspace', icon: MessageSquare, minRole: 'viewer' },
  { label: 'Documentos', href: '/documents', icon: FileText, minRole: 'viewer' },
  { label: 'E-mails', href: '/email', icon: Mail, minRole: 'viewer' },
  { label: 'Tarefas', href: '/producao', icon: Workflow, minRole: 'viewer' },
  { label: 'Calendário', href: '/calendario', icon: CalendarDays, minRole: 'viewer' },
  { label: 'Missões', href: '/missoes', icon: Target, minRole: 'admin' },
  { label: 'Mission Control', href: '/admin/mission-control', icon: Crosshair, minRole: 'admin' },
  { label: 'Chat com Agente', href: '/chat', icon: Bot, minRole: 'operator' },
  { label: 'Pesquisas', href: '/pesquisas', icon: TrendingUp, minRole: 'operator' },
  { label: 'Operações', href: '/operations', icon: Factory, minRole: 'operator' },
  { label: 'Problemas Produção', href: '/problemas-producao', icon: AlertTriangle, minRole: 'viewer' },
  { label: 'Chão de Fábrica', href: '/admin/fabrica', icon: Factory, minRole: 'operator' },
  { label: 'Recepção NF', href: '/admin/operacoes/recepcao', icon: PackageCheck, minRole: 'operator' },
  { label: 'Processos', href: '/processos', icon: ClipboardList, minRole: 'admin' },
  { label: 'Roteiros', href: '/roteiros', icon: BookOpen, minRole: 'operator' },
  { label: 'Setores', href: '/sectors', icon: Building2, minRole: 'operator' },
  { label: 'Conhecimento', href: '/knowledge', icon: FolderOpen, minRole: 'operator' },
  { label: 'Memória', href: '/memory', icon: Brain, minRole: 'operator' },
  { label: 'Auditoria', href: '/audit', icon: Shield, minRole: 'manager' },
  { label: 'Administração', href: '/users', icon: Users, minRole: 'admin' },
  { label: 'Grupos', href: '/groups', icon: UsersRound, minRole: 'admin' },
  { label: 'Monitoramento Áudio', href: '/audio', icon: Mic, minRole: 'admin' },
  { label: 'Visão Computacional', href: '/vision', icon: Eye, minRole: 'admin' },
  { label: 'Executivo', href: '/executive', icon: BarChart3, minRole: 'admin' },
  { label: 'Configurações', href: '/settings', icon: Settings, minRole: 'operator' },
];

export function getNavItemsForRole(role: UserRole): NavItem[] {
  const roleLevel = ['viewer', 'operator', 'manager', 'admin', 'master_admin'].indexOf(role);
  return NAV_ITEMS.filter((item) => {
    const minLevel = ['viewer', 'operator', 'manager', 'admin', 'master_admin'].indexOf(item.minRole);
    return roleLevel >= minLevel;
  });
}

const DEFAULT_NAV_ITEMS = ['/workspace', '/documents', '/email', '/chat', '/calendario'];

export function getNavItemsForUser(
  role: UserRole,
  allowedNavItems: string[] | null
): NavItem[] {
  const roleLevel = ['viewer', 'operator', 'manager', 'admin', 'master_admin'].indexOf(role);
  const isAdmin = role === 'admin' || role === 'master_admin';

  return NAV_ITEMS.filter((item) => {
    const minLevel = ['viewer', 'operator', 'manager', 'admin', 'master_admin'].indexOf(item.minRole);
    if (roleLevel < minLevel) return false;
    if (isAdmin) return true;
    const allowed = allowedNavItems ?? DEFAULT_NAV_ITEMS;
    return allowed.includes(item.href);
  });
}
