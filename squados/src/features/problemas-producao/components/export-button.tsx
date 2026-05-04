'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ProductionProblem } from '../actions/problemas-actions';

interface ExportButtonProps {
  problems: ProductionProblem[];
}

function buildRows(problems: ProductionProblem[]) {
  return problems.map((p) => ({
    cliente: p.client_name,
    recebido_em: new Date(p.received_at).toLocaleString('pt-BR'),
    descricao: p.description,
    status: p.assignments.length > 0 ? 'Encaminhado' : 'Novo',
    encaminhado_para: p.assignments.map((a) => a.assigned_user_name).join(', ') || '—',
    solucao: p.assignments[0]?.solution ?? '—',
  }));
}

export function ExportButton({ problems }: ExportButtonProps) {
  const [loading, setLoading] = useState(false);

  async function exportPdf() {
    setLoading(true);
    try {
      const { jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');
      const doc = new jsPDF({ orientation: 'landscape' });

      doc.setFontSize(14);
      doc.text('Problemas de Produção', 14, 16);
      doc.setFontSize(9);
      doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, 14, 22);

      autoTable(doc, {
        startY: 28,
        head: [['Cliente', 'Recebido em', 'Descrição', 'Status', 'Encaminhado para', 'Solução']],
        body: buildRows(problems).map((r) => [
          r.cliente, r.recebido_em, r.descricao, r.status, r.encaminhado_para, r.solucao,
        ]),
        styles: { fontSize: 8, cellPadding: 3 },
        columnStyles: { 2: { cellWidth: 70 }, 5: { cellWidth: 60 } },
      });

      doc.save(`problemas-producao-${Date.now()}.pdf`);
    } finally {
      setLoading(false);
    }
  }

  async function exportExcel() {
    setLoading(true);
    try {
      const XLSX = await import('xlsx');
      const rows = buildRows(problems);
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Problemas');
      XLSX.writeFile(wb, `problemas-producao-${Date.now()}.xlsx`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <Button variant="outline" size="sm" disabled={loading || problems.length === 0}>
          <Download className="w-4 h-4 mr-2" />
          Exportar
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={exportPdf}>
          Exportar PDF
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportExcel}>
          Exportar Excel (.xlsx)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
