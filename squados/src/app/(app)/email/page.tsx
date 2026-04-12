import { Mail, ExternalLink } from 'lucide-react';
import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';

const GOOGLE_DOMAINS = ['liveuni.com.br', 'liveequipamentos.com.br'];
const HOSTINGER_DOMAINS = ['liveuniverse.com.br'];

const GMAIL_CARD = {
  id: 'google',
  name: 'Google Workspace',
  description: 'Gmail corporativo',
  url: 'https://mail.google.com',
  logo: (
    <svg viewBox="0 0 48 48" className="w-10 h-10" fill="none">
      <rect width="48" height="48" rx="8" fill="#fff" stroke="#e5e7eb"/>
      <rect x="7" y="13" width="34" height="24" rx="2" fill="#fff" stroke="#e5e7eb"/>
      <path d="M7 15l17 12 17-12" stroke="#EA4335" strokeWidth="2" fill="none"/>
      <path d="M7 13l17 14L41 13H7z" fill="#EA4335"/>
      <path d="M7 15v22h34V15L24 27 7 15z" fill="#4285F4"/>
    </svg>
  ),
  color: 'from-blue-50 to-red-50 dark:from-blue-950/30 dark:to-red-950/30',
  border: 'border-blue-200 dark:border-blue-800',
  button: 'bg-blue-600 hover:bg-blue-700',
};

const HOSTINGER_CARD = {
  id: 'hostinger',
  name: 'Hostinger Mail',
  description: 'Webmail corporativo',
  url: 'https://mail.hostinger.com',
  logo: (
    <svg viewBox="0 0 48 48" className="w-10 h-10" fill="none">
      <rect width="48" height="48" rx="8" fill="#673DE6"/>
      <text x="24" y="32" textAnchor="middle" fill="white" fontSize="22" fontWeight="bold" fontFamily="Arial">H</text>
    </svg>
  ),
  color: 'from-purple-50 to-violet-50 dark:from-purple-950/30 dark:to-violet-950/30',
  border: 'border-purple-200 dark:border-purple-800',
  button: 'bg-purple-600 hover:bg-purple-700',
};

function getEmailDomain(email: string): string {
  return email.split('@')[1]?.toLowerCase() ?? '';
}

function getProvidersForEmail(email: string) {
  const domain = getEmailDomain(email);
  if (GOOGLE_DOMAINS.includes(domain)) return [GMAIL_CARD];
  if (HOSTINGER_DOMAINS.includes(domain)) return [HOSTINGER_CARD];
  return [GMAIL_CARD, HOSTINGER_CARD];
}

export default async function EmailPage() {
  const { profile } = await getAuthenticatedUser();
  const providers = getProvidersForEmail(profile.email);

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Mail className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">E-mails</h1>
          <p className="text-sm text-muted-foreground">Acesse sua caixa de entrada corporativa</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {providers.map((provider) => (
          <div
            key={provider.id}
            className={`rounded-xl border bg-gradient-to-br ${provider.color} ${provider.border} p-6 flex flex-col gap-4`}
          >
            <div className="flex items-center gap-3">
              {provider.logo}
              <div>
                <p className="font-semibold text-base">{provider.name}</p>
                <p className="text-xs text-muted-foreground">{provider.description}</p>
              </div>
            </div>

            <a
              href={provider.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-colors ${provider.button}`}
            >
              <ExternalLink className="w-4 h-4" />
              Abrir {provider.name}
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
