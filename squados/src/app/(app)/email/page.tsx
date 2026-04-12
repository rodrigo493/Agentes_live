import { Mail, ExternalLink } from 'lucide-react';

const EMAIL_PROVIDERS = [
  {
    id: 'google',
    name: 'Google Workspace',
    description: 'Gmail corporativo',
    url: 'https://mail.google.com',
    logo: (
      <svg viewBox="0 0 48 48" className="w-10 h-10">
        <path fill="#EA4335" d="M24 5.457a19.543 19.543 0 1 0 0 39.086A19.543 19.543 0 0 0 24 5.457z" opacity="0"/>
        <path fill="#4285F4" d="M7.667 39.048V19.333L24 31.143l16.333-11.81v19.715H7.667z"/>
        <path fill="#34A853" d="M40.333 19.333 24 31.143 7.667 19.333 24 8.952l16.333 10.381z" opacity="0"/>
        <path fill="#FBBC05" d="M7.667 19.333 24 8.952l16.333 10.381L24 31.143 7.667 19.333z" opacity="0"/>
        <path fill="#EA4335" d="M7.667 19.333V9L24 19.571 40.333 9v10.333L24 31.143 7.667 19.333z" opacity="0"/>
        <path fill="#C5221F" d="M7.667 9 24 19.571 40.333 9H7.667z" opacity="0"/>
        {/* Gmail envelope */}
        <rect width="34" height="26" x="7" y="11" fill="#fff" rx="2"/>
        <path fill="#EA4335" d="M7 11l17 13 17-13H7z"/>
        <path fill="#4285F4" d="M7 11v26h34V11L24 24 7 11z"/>
        <path fill="#34A853" d="M41 37H7l17-13 17 13z" opacity="0"/>
      </svg>
    ),
    color: 'from-blue-50 to-red-50 dark:from-blue-950/30 dark:to-red-950/30',
    border: 'border-blue-200 dark:border-blue-800',
    button: 'bg-blue-600 hover:bg-blue-700',
  },
  {
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
  },
];

export default function EmailPage() {
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
        {EMAIL_PROVIDERS.map((provider) => (
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
