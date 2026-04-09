'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { selectSectorAction } from '../actions/auth-actions';

interface Sector {
  id: string;
  name: string;
  icon: string | null;
}

interface SelectSectorFormProps {
  sectors: Sector[];
}

export function SelectSectorForm({ sectors }: SelectSectorFormProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  async function handleSelect() {
    if (!selected) return;
    setLoading(true);
    setError('');
    const result = await selectSectorAction(selected);
    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }
    router.push('/dashboard');
  }

  const selectedSector = sectors.find((s) => s.id === selected);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl font-bold text-primary">S</span>
          </div>
          <h1 className="text-xl font-bold">Em qual setor você vai trabalhar hoje?</h1>
          <p className="text-sm text-muted-foreground mt-1">Escolha um setor para continuar</p>
        </div>

        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive text-center">
            {error}
          </div>
        )}

        <div className="space-y-2">
          {sectors.map((sector) => (
            <button
              key={sector.id}
              onClick={() => setSelected(sector.id)}
              className={`w-full flex items-center gap-3 p-4 rounded-lg border transition-all text-left ${
                selected === sector.id
                  ? 'border-primary bg-primary/5 ring-1 ring-primary'
                  : 'border-border hover:border-primary/40 hover:bg-muted/30'
              }`}
            >
              {sector.icon && (
                <span className="text-xl flex-shrink-0">{sector.icon}</span>
              )}
              <span className="font-medium text-sm">{sector.name}</span>
            </button>
          ))}
        </div>

        <button
          onClick={handleSelect}
          disabled={!selected || loading}
          className="w-full py-2.5 px-4 rounded-lg bg-primary text-primary-foreground font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
        >
          {loading
            ? 'Entrando...'
            : selectedSector
            ? `Entrar no ${selectedSector.name}`
            : 'Selecione um setor'}
        </button>
      </div>
    </div>
  );
}
