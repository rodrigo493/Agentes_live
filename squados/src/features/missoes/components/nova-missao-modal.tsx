'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Zap, ArrowLeft, Rocket } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onClose: () => void;
  onCriada: () => void;
}

export function NovaMissaoModal({ open, onClose, onCriada }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [intencao, setIntencao] = useState('');
  const [perguntas, setPerguntas] = useState<string[]>([]);
  const [respostas, setRespostas] = useState<string[]>([]);
  const [gerando, setGerando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  async function handleGerarFormulario() {
    if (!intencao.trim()) return;
    setGerando(true);
    try {
      const res = await fetch('/api/missoes/gerar-formulario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intencao }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setPerguntas(data.perguntas ?? []);
      setRespostas(new Array((data.perguntas ?? []).length).fill(''));
      setStep(2);
    } catch {
      toast.error('Falha ao gerar perguntas. Tente novamente.');
    } finally {
      setGerando(false);
    }
  }

  async function handleIniciarMissao() {
    setSalvando(true);
    try {
      const res = await fetch('/api/missoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intencao, perguntas, respostas }),
      });
      if (!res.ok) throw new Error();
      toast.success('Missão criada. A Orquestradora irá planejar em até 15 minutos.');
      handleClose();
      onCriada();
    } catch {
      toast.error('Falha ao criar missão. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  }

  function handleClose() {
    onClose();
    setTimeout(() => {
      setStep(1);
      setIntencao('');
      setPerguntas([]);
      setRespostas([]);
    }, 300);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center flex-shrink-0">
              <Rocket className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-base">Nova Missão</DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Passo {step} de 2 —{' '}
                {step === 1 ? 'Descreva a intenção' : 'Contextualize a missão'}
              </p>
            </div>
            <div className="flex gap-1.5 flex-shrink-0">
              <div
                className={`h-1.5 w-8 rounded-full transition-colors duration-300 ${step >= 1 ? 'bg-orange-500' : 'bg-muted'}`}
              />
              <div
                className={`h-1.5 w-8 rounded-full transition-colors duration-300 ${step >= 2 ? 'bg-orange-500' : 'bg-muted'}`}
              />
            </div>
          </div>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4 pt-1">
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Descreva a missão que você quer executar
              </label>
              <Textarea
                placeholder="Ex: Quero lançar uma campanha de email para fisioterapeutas sobre o V12 Neuro com foco em captação de leads para demonstração..."
                className="min-h-[140px] resize-none text-sm"
                value={intencao}
                onChange={(e) => setIntencao(e.target.value)}
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                Seja específico sobre o objetivo. A Orquestradora irá estruturar o plano de
                execução.
              </p>
            </div>
            <div className="flex justify-end">
              <Button
                onClick={handleGerarFormulario}
                disabled={!intencao.trim() || gerando}
                className="bg-orange-500 hover:bg-orange-600 text-white"
              >
                {gerando ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Gerando perguntas…
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 mr-2" />
                    Gerar Formulário
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4 pt-1">
            <div className="bg-muted rounded-md px-3 py-2 text-xs">
              <span className="font-semibold text-foreground">Intenção: </span>
              <span className="text-muted-foreground">{intencao}</span>
            </div>

            <div className="space-y-5 max-h-[380px] overflow-y-auto pr-1">
              {perguntas.map((pergunta, i) => (
                <div key={i} className="space-y-1.5">
                  <label className="text-sm font-medium flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-orange-100 text-orange-700 text-xs flex items-center justify-center flex-shrink-0 mt-0.5 font-bold">
                      {i + 1}
                    </span>
                    <span>{pergunta}</span>
                  </label>
                  <div className="pl-7">
                    <Textarea
                      className="min-h-[72px] resize-none text-sm"
                      placeholder="Sua resposta…"
                      value={respostas[i] ?? ''}
                      onChange={(e) => {
                        const novas = [...respostas];
                        novas[i] = e.target.value;
                        setRespostas(novas);
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-2 border-t">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStep(1)}
                disabled={salvando}
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                Voltar
              </Button>
              <Button
                onClick={handleIniciarMissao}
                disabled={salvando}
                className="bg-orange-500 hover:bg-orange-600 text-white"
              >
                {salvando ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Criando…
                  </>
                ) : (
                  <>
                    <Rocket className="w-4 h-4 mr-2" />
                    Iniciar Missão
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
