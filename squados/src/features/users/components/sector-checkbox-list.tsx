'use client';

interface Sector {
  id: string;
  name: string;
  icon: string | null;
}

interface SectorCheckboxListProps {
  sectors: Sector[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}

export function SectorCheckboxList({
  sectors,
  selectedIds,
  onChange,
  disabled = false,
}: SectorCheckboxListProps) {
  function toggle(id: string) {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((s) => s !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  }

  return (
    <div className="space-y-2">
      {sectors.map((sector) => (
        <label
          key={sector.id}
          className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
            selectedIds.includes(sector.id)
              ? 'border-primary bg-primary/5'
              : 'border-input hover:bg-muted/30'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <input
            type="checkbox"
            checked={selectedIds.includes(sector.id)}
            onChange={() => toggle(sector.id)}
            disabled={disabled}
            className="accent-primary w-4 h-4 flex-shrink-0"
          />
          {sector.icon && <span className="text-base">{sector.icon}</span>}
          <span className="text-sm font-medium">{sector.name}</span>
        </label>
      ))}
      {sectors.length === 0 && (
        <p className="text-xs text-muted-foreground">Nenhum setor ativo cadastrado.</p>
      )}
    </div>
  );
}
