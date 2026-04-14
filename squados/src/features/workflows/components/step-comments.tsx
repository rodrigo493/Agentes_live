'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { MessageSquare, Send } from 'lucide-react';
import { toast } from 'sonner';
import { addStepCommentAction, listStepCommentsAction } from '../actions/comment-actions';

interface Props {
  stepId: string;
  isAssignee: boolean;
}

type Comment = { id: string; body: string; user_name: string; created_at: string };

export function StepComments({ stepId, isAssignee }: Props) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    listStepCommentsAction(stepId).then((r) => {
      if (r.comments) setComments(r.comments as Comment[]);
    });
  }, [stepId]);

  async function handleSend() {
    if (!body.trim()) return;
    setSending(true);
    const r = await addStepCommentAction(stepId, body);
    setSending(false);
    if (r.error) return toast.error(r.error);
    if (r.comment) {
      setComments((prev) => [...prev, { ...r.comment!, user_name: 'Você' }]);
      setBody('');
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        <MessageSquare className="w-3.5 h-3.5" /> Comentários
      </div>

      {comments.length === 0 && (
        <p className="text-xs text-muted-foreground">Nenhum comentário ainda.</p>
      )}

      {comments.map((c) => (
        <div key={c.id} className="text-sm border rounded-md p-2 bg-muted/20">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="font-medium text-xs">{c.user_name}</span>
            <span className="text-[10px] text-muted-foreground">
              {new Date(c.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          <p className="text-xs">{c.body}</p>
        </div>
      ))}

      {isAssignee && (
        <div className="flex gap-2">
          <Textarea
            rows={2}
            placeholder="Adicionar comentário…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="text-sm"
          />
          <Button size="sm" onClick={handleSend} disabled={sending || !body.trim()} className="self-end">
            <Send className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
