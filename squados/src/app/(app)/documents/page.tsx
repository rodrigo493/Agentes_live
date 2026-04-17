import { getMyDocumentsAction, getGroupDocumentsAction, getSentDocumentsAction } from '@/features/documents/actions/document-actions';
import { DocumentsPage } from '@/features/documents/components/documents-page';

export default async function DocumentsRoute() {
  const [dmGroups, groupGroups, sentFiles] = await Promise.all([
    getMyDocumentsAction(),
    getGroupDocumentsAction(),
    getSentDocumentsAction(),
  ]);

  return <DocumentsPage dmGroups={dmGroups} groupGroups={groupGroups} sentFiles={sentFiles} />;
}
