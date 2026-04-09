'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Check } from 'lucide-react';
import { selectSectorAction } from '../actions/auth-actions';

interface Sector {
  id: string;
  name: string;
  icon: string | null;
}

interface SectorSwitcherProps {
  sectors: Sector[];
  activeSector: Sector | null;
  collapsed?: boolean;
}

export function SectorSwitcher({ sectors, activeSector, collapsed = false }: SectorSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Fecha o dropdown ao clicar fora
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function handleSwitch(sectorId: string) {
    if (sectorId === activeSector?.id) { setOpen(false); return; }
    setSwitching(true);
    setOpen(false);
    const result = await selectSectorAction(sectorId);
    if (!result.error) {
      router.refresh();
    }
    setSwitching(false);
  }

  if (!activeSector) return null;

  if (collapsed) {
    return (
      <div ref={ref} className="relative">
        <button
          onClick={() => setOpen(!open)}
          title={activeSector.name}
          className="w-full flex items-center justify-center p-2 rounded-lg hover:bg-[hsl(var(--sidebar-accent))] transition-colors text-[hsl(var(--sidebar-muted))]"
        >
          <span className="text-base">{activeSector.icon ?? '🏢'}</span>
        </button>
        {open && (
          <div className="absolute left-full top-0 ml-2 w-44 bg-popover border border-border rounded-lg shadow-lg py-1 z-50">
            {sectors.map((s) => (
              <button
                key={s.id}
                onClick={() => handleSwitch(s.id)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
              >
                <span>{s.icon ?? '🏢'}</span>
                <span className="flex-1 text-left">{s.name}</span>
                {s.id === activeSector.id && <Check className="w-3 h-3 text-primary" />}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={switching}
        className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-[hsl(var(--sidebar-accent))] transition-colors text-[hsl(var(--sidebar-foreground))]"
      >
        <span className="text-base flex-shrink-0">{activeSector.icon ?? '🏢'}</span>
        <span className="flex-1 text-sm font-medium truncate text-left">
          {switching ? 'Trocando...' : activeSector.name}
        </span>
        <ChevronDown className={`w-3 h-3 text-[hsl(var(--sidebar-muted))] flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 right-0 mb-1 bg-popover border border-border rounded-lg shadow-lg py-1 z-50">
          <p className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Trocar setor
          </p>
          {sectors.map((s) => (
            <button
              key={s.id}
              onClick={() => handleSwitch(s.id)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
            >
              <span className="text-base flex-shrink-0">{s.icon ?? '🏢'}</span>
              <span className="flex-1 text-left">{s.name}</span>
              {s.id === activeSector.id && <Check className="w-3 h-3 text-primary flex-shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
