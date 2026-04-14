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

  if (sectors.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">Nenhum setor ativo cadastrado.</p>
    );
  }

  return (
    <div className="w-full overflow-hidden grid grid-cols-2 sm:grid-cols-3 gap-2">
      {sectors.map((sector) => (
        <label
          key={sector.id}
          className={`w-full min-h-[60px] flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors ${
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
            className="accent-primary w-4 h-4 flex-shrink-0 mt-0.5"
          />
          {sector.icon && (
            <span className="text-base flex-shrink-0 leading-none mt-0.5">{sector.icon}</span>
          )}
          <span className="text-xs font-medium break-words leading-snug">{sector.name}</span>
        </label>
      ))}
    </div>
  );
}
