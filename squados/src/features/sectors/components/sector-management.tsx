'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Building2,
  FileText,
  Brain,
  Users,
  Plus,
  Search,
  Bot,
  Upload,
  FileUp,
  CheckCircle2,
  ImageIcon,
} from 'lucide-react';
import { createSectorAction, assignUserToSectorAction } from '../actions/sector-actions';
import { ingestDocumentAction } from '@/features/knowledge/actions/knowledge-actions';

interface SectorWithAgent {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  area: string | null;
  icon: string | null;
  agents: { name: string; display_name: string; status: string } | null;
}

interface SectorUser {
  id: string;
  full_name: string;
  email: string;
  role: string;
  sector_id: string | null;
}

interface SectorManagementProps {
  sectors: SectorWithAgent[];
  docCounts: Record<string, number>;
  memoryCounts: Record<string, number>;
  userCounts: Record<string, number>;
  allUsers: SectorUser[];
}

const ROLE_LABELS: Record<string, string> = {
  master_admin: 'Master Admin',
  admin: 'Admin',
  manager: 'Gestor',
  operator: 'Operador',
  viewer: 'Viewer',
};

export function SectorManagement({ sectors, docCounts, memoryCounts, userCounts, allUsers }: SectorManagementProps) {
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [ingestOpen, setIngestOpen] = useState(false);
  const [ingestSector, setIngestSector] = useState<SectorWithAgent | null>(null);
  const [usersOpen, setUsersOpen] = useState(false);
  const [usersSector, setUsersSector] = useState<SectorWithAgent | null>(null);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const [ingestSuccess, setIngestSuccess] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [docTitle, setDocTitle] = useState('');
  const [docContent, setDocContent] = useState('');
  const [docType, setDocType] = useState('transcript');
  const [docTags, setDocTags] = useState('');
  const [docImages, setDocImages] = useState<File[]>([]);
  const [docImagePreviews, setDocImagePreviews] = useState<string[]>([]);
  const docImagesInputRef = useRef<HTMLInputElement>(null);
  const [userSearch, setUserSearch] = useState('');
  const router = useRouter();

  const filtered = sectors.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.slug.toLowerCase().includes(search.toLowerCase())
  );

  function handleNameChange(value: string) {
    setName(value);
    setSlug(
      value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '')
    );
  }

  async function handleCreate(formData: FormData) {
    setCreating(true);
    setError('');
    const result = await createSectorAction(formData);
    if (result.error) {
      setError(result.error);
    } else {
      setCreateOpen(false);
      setName('');
      setSlug('');
      router.refresh();
    }
    setCreating(false);
  }

  function openIngest(sector: SectorWithAgent) {
    setIngestSector(sector);
    setIngestOpen(true);
    setIngestSuccess(false);
    setDocTitle('');
    setDocContent('');
    setDocType('transcript');
    setDocTags('');
    setDocImages([]);
    setDocImagePreviews([]);
    setError('');
  }

  async function handleIngest(e: React.FormEvent) {
    e.preventDefault();
    if (!ingestSector) return;
    setIngesting(true);
    setError('');

    const formData = new FormData();
    formData.set('sector_id', ingestSector.id);
    formData.set('title', docTitle);
    formData.set('content', docContent);
    formData.set('doc_type', docType);
    formData.set('tags', JSON.stringify(
      docTags.split(',').map((t) => t.trim()).filter(Boolean)
    ));
    docImages.forEach((file) => formData.append('images', file));

    const result = await ingestDocumentAction(formData);
    if (result.error) {
      setError(result.error);
    } else {
      setIngestSuccess(true);
      setDocTitle('');
      setDocContent('');
      setDocTags('');
      setDocImages([]);
      setDocImagePreviews([]);
      // Refresh after 1.5s
      setTimeout(() => {
        router.refresh();
      }, 1500);
    }
    setIngesting(false);
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    setDocContent(text);
    if (!docTitle) {
      setDocTitle(file.name.replace(/\.[^.]+$/, ''));
    }
  }

  return (
    <>
      {/* Search + Create */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar setores..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Novo Setor
        </Button>
      </div>

      {/* Create Sector Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Criar Setor</DialogTitle>
          </DialogHeader>
          <form action={handleCreate} className="space-y-4">
            {error && !ingestOpen && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
            )}
            <div className="space-y-2">
              <Label htmlFor="name">Nome</Label>
              <Input
                id="name"
                name="name"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Ex: Financeiro"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slug">Slug</Label>
              <Input
                id="slug"
                name="slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="Ex: financeiro"
                required
              />
              <p className="text-[11px] text-muted-foreground">
                Identificador único. Apenas letras minúsculas, números e underscore.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Descrição (opcional)</Label>
              <Input id="description" name="description" placeholder="Descrição do setor" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="area">Área (opcional)</Label>
              <Input id="area" name="area" placeholder="Ex: Administrativo" />
            </div>
            <Button type="submit" className="w-full" disabled={creating}>
              {creating ? 'Criando...' : 'Criar Setor'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Ingest Transcript Dialog */}
      <Dialog open={ingestOpen} onOpenChange={setIngestOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5 text-primary" />
              Importar Transcrição — {ingestSector?.name}
            </DialogTitle>
          </DialogHeader>

          {ingestSuccess ? (
            <div className="py-8 text-center space-y-3">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
              <p className="font-semibold">Transcrição importada com sucesso!</p>
              <p className="text-sm text-muted-foreground">
                O conteúdo foi processado e adicionado à base de conhecimento do setor.
              </p>
            </div>
          ) : (
            <form onSubmit={handleIngest} className="space-y-4">
              {error && ingestOpen && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
              )}

              {/* File upload area */}
              <div className="space-y-2">
                <Label>Arquivo (opcional)</Label>
                <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                  <FileUp className="w-6 h-6 text-muted-foreground mb-1" />
                  <span className="text-xs text-muted-foreground">
                    Clique para selecionar .txt, .md, .csv
                  </span>
                  <input
                    type="file"
                    accept=".txt,.md,.csv,.text"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>

              <div className="space-y-2">
                <Label htmlFor="doc_title">Título</Label>
                <Input
                  id="doc_title"
                  value={docTitle}
                  onChange={(e) => setDocTitle(e.target.value)}
                  placeholder="Ex: Reunião semanal 07/04/2026"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="doc_type">Tipo de documento</Label>
                <select
                  id="doc_type"
                  value={docType}
                  onChange={(e) => setDocType(e.target.value)}
                  className="w-full rounded-md border border-input px-3 py-2 text-sm bg-background"
                >
                  <option value="transcript">Transcrição de reunião</option>
                  <option value="document">Documento</option>
                  <option value="procedure">Procedimento</option>
                  <option value="manual">Manual</option>
                  <option value="note">Anotação</option>
                  <option value="other">Outro</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="doc_content">Conteúdo da transcrição</Label>
                <Textarea
                  id="doc_content"
                  value={docContent}
                  onChange={(e) => setDocContent(e.target.value)}
                  placeholder="Cole aqui o conteúdo da transcrição da reunião..."
                  rows={8}
                  className="font-mono text-xs"
                  required
                />
                <p className="text-[11px] text-muted-foreground">
                  {docContent.length > 0
                    ? `${docContent.length.toLocaleString()} caracteres`
                    : 'Cole o texto ou faça upload de um arquivo acima'}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="doc_tags">Tags (separadas por vírgula)</Label>
                <Input
                  id="doc_tags"
                  value={docTags}
                  onChange={(e) => setDocTags(e.target.value)}
                  placeholder="Ex: reunião, financeiro, planejamento"
                />
              </div>

              <div className="space-y-2">
                <Label>Imagens do documento <span className="text-muted-foreground">(opcional)</span></Label>
                <input
                  ref={docImagesInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    setDocImages((prev) => [...prev, ...files]);
                    files.forEach((file) => {
                      const url = URL.createObjectURL(file);
                      setDocImagePreviews((prev) => [...prev, url]);
                    });
                    e.target.value = '';
                  }}
                />
                {docImagePreviews.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {docImagePreviews.map((preview, i) => (
                      <div key={i} className="relative group">
                        <img
                          src={preview}
                          alt={`Imagem ${i + 1}`}
                          className="w-20 h-20 object-cover rounded-lg border border-border"
                        />
                        <button
                          type="button"
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-destructive text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => {
                            setDocImages((prev) => prev.filter((_, idx) => idx !== i));
                            setDocImagePreviews((prev) => prev.filter((_, idx) => idx !== i));
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2 text-xs"
                  onClick={() => docImagesInputRef.current?.click()}
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  Adicionar imagens
                </Button>
              </div>

              <Button type="submit" className="w-full gap-2" disabled={ingesting}>
                {ingesting ? (
                  'Processando...'
                ) : (
                  <>
                    <Upload className="w-4 h-4" /> Importar Transcrição
                  </>
                )}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Users per Sector Dialog */}
      <Dialog open={usersOpen} onOpenChange={setUsersOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              Usuários — {usersSector?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder="Buscar usuário..."
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              className="h-9"
            />

            {/* Users in this sector */}
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground mb-2">Neste setor</p>
              {allUsers
                .filter((u) => u.sector_id === usersSector?.id)
                .filter((u) =>
                  u.full_name.toLowerCase().includes(userSearch.toLowerCase()) ||
                  u.email.toLowerCase().includes(userSearch.toLowerCase())
                )
                .map((u) => (
                  <div key={u.id} className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/50">
                    <div>
                      <p className="text-sm font-medium">{u.full_name}</p>
                      <p className="text-[11px] text-muted-foreground">{u.email} · {ROLE_LABELS[u.role] ?? u.role}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-destructive hover:text-destructive"
                      disabled={assigning === u.id}
                      onClick={async () => {
                        setAssigning(u.id);
                        await assignUserToSectorAction(u.id, null);
                        router.refresh();
                        setAssigning(null);
                      }}
                    >
                      Remover
                    </Button>
                  </div>
                ))}
              {allUsers.filter((u) => u.sector_id === usersSector?.id).length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-3">Nenhum usuário neste setor</p>
              )}
            </div>

            {/* Users without sector or in other sectors */}
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground mb-2">Adicionar ao setor</p>
              {allUsers
                .filter((u) => u.sector_id !== usersSector?.id)
                .filter((u) =>
                  u.full_name.toLowerCase().includes(userSearch.toLowerCase()) ||
                  u.email.toLowerCase().includes(userSearch.toLowerCase())
                )
                .slice(0, 10)
                .map((u) => (
                  <div key={u.id} className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-muted/50">
                    <div>
                      <p className="text-sm font-medium">{u.full_name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {u.email} · {ROLE_LABELS[u.role] ?? u.role}
                        {u.sector_id && ` · ${sectors.find((s) => s.id === u.sector_id)?.name ?? 'Outro setor'}`}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      disabled={assigning === u.id}
                      onClick={async () => {
                        setAssigning(u.id);
                        await assignUserToSectorAction(u.id, usersSector!.id);
                        router.refresh();
                        setAssigning(null);
                      }}
                    >
                      Adicionar
                    </Button>
                  </div>
                ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Sector Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((sector) => {
          const docsCount = docCounts[sector.id] ?? 0;
          const memCount = memoryCounts[sector.id] ?? 0;
          const usrCount = userCounts[sector.id] ?? 0;

          return (
            <Card
              key={sector.id}
              className="hover:shadow-md transition-all hover:border-primary/30 group"
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                      <Building2 className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold">{sector.name}</h3>
                      {sector.agents ? (
                        <Badge variant="outline" className="text-[9px] mt-1 gap-1">
                          <Bot className="w-2.5 h-2.5" /> Agente ativo
                        </Badge>
                      ) : (
                        <span className="text-[9px] text-muted-foreground mt-1 block">
                          Sem agente
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {sector.description && (
                  <p className="text-xs text-muted-foreground mb-3 line-clamp-2">
                    {sector.description}
                  </p>
                )}

                {/* Stats */}
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div className="text-center p-2 rounded-lg bg-muted/50">
                    <FileText className="w-3.5 h-3.5 text-muted-foreground mx-auto mb-1" />
                    <p className="text-xs font-bold">{docsCount}</p>
                    <p className="text-[9px] text-muted-foreground">docs</p>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-muted/50">
                    <Brain className="w-3.5 h-3.5 text-muted-foreground mx-auto mb-1" />
                    <p className="text-xs font-bold">{memCount}</p>
                    <p className="text-[9px] text-muted-foreground">memórias</p>
                  </div>
                  <button
                    type="button"
                    className="text-center p-2 rounded-lg bg-muted/50 hover:bg-primary/10 transition-colors cursor-pointer"
                    onClick={() => { setUsersSector(sector); setUsersOpen(true); setUserSearch(''); }}
                  >
                    <Users className="w-3.5 h-3.5 text-muted-foreground mx-auto mb-1" />
                    <p className="text-xs font-bold">{usrCount}</p>
                    <p className="text-[9px] text-muted-foreground">usuários</p>
                  </button>
                </div>

                {/* Import button */}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2 text-xs"
                  onClick={() => openIngest(sector)}
                >
                  <Upload className="w-3.5 h-3.5" />
                  Importar Transcrição
                </Button>
              </CardContent>
            </Card>
          );
        })}

        {filtered.length === 0 && (
          <div className="col-span-full p-8 text-center text-muted-foreground">
            Nenhum setor encontrado.
          </div>
        )}
      </div>
    </>
  );
}
