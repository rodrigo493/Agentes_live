'use client';

import { FolderOpen, Users } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DocumentCard } from './document-card';
import type { DmDocumentGroup, GroupDocumentGroup } from '../actions/document-actions';

interface Props {
  dmGroups: DmDocumentGroup[];
  groupGroups: GroupDocumentGroup[];
}

export function DocumentsPage({ dmGroups, groupGroups }: Props) {
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-bold">Documentos</h1>

      <Tabs defaultValue="dm">
        <TabsList>
          <TabsTrigger value="dm">Meus Documentos</TabsTrigger>
          <TabsTrigger value="groups">Grupos</TabsTrigger>
        </TabsList>

        <TabsContent value="dm" className="mt-4">
          {dmGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum documento recebido ainda.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {dmGroups.map((g) => (
                <DocumentCard
                  key={g.sector_id ?? 'sem-setor'}
                  title={g.sector_name}
                  icon={<FolderOpen className="h-4 w-4 text-muted-foreground" />}
                  files={g.files}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="groups" className="mt-4">
          {groupGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum documento em grupos ainda.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {groupGroups.map((g) => (
                <DocumentCard
                  key={g.conversation_id}
                  title={g.group_name}
                  icon={<Users className="h-4 w-4 text-muted-foreground" />}
                  files={g.files}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
