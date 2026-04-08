import type { UserRole } from '@/shared/types/database';

// Role hierarchy: higher index = more permissions
const ROLE_HIERARCHY: UserRole[] = [
  'viewer',
  'operator',
  'manager',
  'admin',
  'master_admin',
];

export function getRoleLevel(role: UserRole): number {
  return ROLE_HIERARCHY.indexOf(role);
}

export function hasMinRole(userRole: UserRole, minRole: UserRole): boolean {
  return getRoleLevel(userRole) >= getRoleLevel(minRole);
}

export function isAdmin(role: UserRole): boolean {
  return hasMinRole(role, 'admin');
}

export function isMasterAdmin(role: UserRole): boolean {
  return role === 'master_admin';
}
