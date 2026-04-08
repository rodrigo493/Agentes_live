import type { Profile } from '@/shared/types/database';

export interface AuthContract {
  login(email: string, password: string): Promise<{ success: boolean; error?: string }>;
  logout(): Promise<void>;
  getSession(): Promise<{ user: { id: string; email: string } | null; profile: Profile | null }>;
}
