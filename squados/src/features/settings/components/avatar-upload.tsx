'use client';

import { useRef, useState } from 'react';
import { createClient } from '@/shared/lib/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Camera, Trash2 } from 'lucide-react';

interface AvatarUploadProps {
  currentUrl: string | null;
  userId: string;
  name: string;
  onUpload: (url: string | null) => Promise<void>;
}

function getInitials(name: string) {
  return name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
}

export function AvatarUpload({ currentUrl, userId, name, onUpload }: AvatarUploadProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  const displayUrl = preview ?? currentUrl;

  async function handleFile(file: File) {
    if (file.size > 2 * 1024 * 1024) {
      setError('Arquivo muito grande. Máximo 2 MB.');
      return;
    }
    setError('');
    setUploading(true);
    setPreview(URL.createObjectURL(file));

    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `${userId}/${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true });

    if (uploadError) {
      setPreview(null);
      setError('Erro ao enviar imagem. Tente novamente.');
      setUploading(false);
      return;
    }

    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    await onUpload(data.publicUrl);
    setUploading(false);
  }

  async function handleRemove() {
    setPreview(null);
    setError('');
    await onUpload(null);
  }

  return (
    <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/40 border border-border">
      <Avatar className="h-16 w-16 flex-shrink-0">
        {displayUrl && <AvatarImage src={displayUrl} alt={name} />}
        <AvatarFallback className="text-lg bg-primary/10 text-primary">
          {getInitials(name)}
        </AvatarFallback>
      </Avatar>

      <div className="flex flex-col gap-2 min-w-0">
        <span className="text-sm font-medium">Foto de perfil</span>
        <div className="flex gap-2 flex-wrap">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
          >
            <Camera className="w-3.5 h-3.5 mr-1.5" />
            {uploading ? 'Enviando...' : 'Trocar foto'}
          </Button>
          {displayUrl && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRemove}
              disabled={uploading}
              className="text-destructive border-destructive/30 hover:bg-destructive/10"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <p className="text-xs text-muted-foreground">JPG, PNG ou GIF · máx 2 MB</p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}
