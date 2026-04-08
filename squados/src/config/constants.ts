export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'SquadOS';
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

export const AUTH_ROUTES = ['/login', '/forgot-password', '/reset-password'];
export const PUBLIC_ROUTES = [...AUTH_ROUTES];

export const PROTECTED_ROUTES = {
  admin: ['/users', '/sectors', '/groups', '/permissions', '/ingestion', '/audit'],
  app: ['/dashboard', '/chat', '/workspace', '/knowledge', '/settings'],
};

export const SESSION_CONFIG = {
  accessTokenLifetime: 3600, // 1 hour
  refreshTokenLifetime: 604800, // 7 days
};
