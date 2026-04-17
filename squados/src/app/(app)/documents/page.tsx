import { getMyDocumentsAction, getGroupDocumentsAction } from '@/features/documents/actions/document-actions';
import { DocumentsPage } from '@/features/documents/components/documents-page';

export default async function DocumentsRoute() {
  const [dmGroups, groupGroups] = await Promise.all([
    getMyDocumentsAction(),
    getGroupDocumentsAction(),
  ]);

  return <DocumentsPage dmGroups={dmGroups} groupGroups={groupGroups} />;
}
