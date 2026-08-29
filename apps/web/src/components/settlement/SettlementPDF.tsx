'use client';

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface SettlementRecord {
  work_day: string;
  block_name: string;
  product_name: string;
  quantity: number;
  rate: number;
  subtotal: number;
}

interface SettlementPDFData {
  workerName: string;
  workerRut: string | null;
  periodStart: string;
  periodEnd: string;
  totalAmount: number;
  status: string;
  generatedAt: string;
  records: SettlementRecord[];
  payments?: { date: string; amount: number; notes: string }[];
}

export function generateSettlementPDF(data: SettlementPDFData): void {
  const doc = new jsPDF();
  const statusLabels: Record<string, string> = { pending: 'Pendiente', partial: 'Parcial', paid: 'Pagado' };

  // Header
  doc.setFillColor(27, 94, 32);
  doc.rect(0, 0, 210, 22, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Liquidación de Producción', 14, 14);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Fundo360 — Gestión Integral de Campo', 14, 20);

  // Worker info
  let y = 34;
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Datos del Trabajador', 14, y);
  y += 8;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text('Nombre:', 14, y);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.text(data.workerName, 50, y);
  y += 6;
  if (data.workerRut) {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text('RUT:', 14, y);
    doc.setTextColor(0, 0, 0);
    doc.text(data.workerRut, 50, y);
    y += 6;
  }

  // Period info
  y += 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.text('Período', 14, y);
  y += 8;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text('Desde:', 14, y);
  doc.setTextColor(0, 0, 0);
  doc.text(data.periodStart, 50, y);
  doc.setTextColor(100, 100, 100);
  doc.text('Hasta:', 100, y);
  doc.setTextColor(0, 0, 0);
  doc.text(data.periodEnd, 130, y);
  y += 6;
  doc.setTextColor(100, 100, 100);
  doc.text('Estado:', 14, y);
  doc.setTextColor(0, 0, 0);
  doc.text(statusLabels[data.status] || data.status, 50, y);

  // Table
  y += 10;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Detalle de Producción', 14, y);
  y += 4;

  autoTable(doc, {
    startY: y,
    head: [['Fecha', 'Paño', 'Producto', 'Cant.', 'Tarifa', 'Subtotal']],
    body: data.records.map(r => [
      r.work_day,
      r.block_name,
      r.product_name,
      String(r.quantity),
      `$${r.rate.toLocaleString()}`,
      `$${r.subtotal.toLocaleString()}`,
    ]),
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [27, 94, 32], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 247, 245] },
    columnStyles: {
      0: { cellWidth: 25 },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right', fontStyle: 'bold' },
    },
    margin: { left: 14, right: 14 },
  });

  // Total
  const finalY = (doc as any).lastAutoTable.finalY + 10;
  doc.setDrawColor(27, 94, 32);
  doc.setLineWidth(0.5);
  doc.line(14, finalY - 4, 196, finalY - 4);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('TOTAL A PAGAR', 14, finalY + 2);
  doc.setFontSize(14);
  doc.setTextColor(27, 94, 32);
  doc.text(`$${data.totalAmount.toLocaleString()}`, 196, finalY + 2, { align: 'right' });

  // Payments section
  let paymentsY = finalY + 16;
  const totalPaid = (data.payments || []).reduce((s, p) => s + p.amount, 0);

  if (data.payments && data.payments.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.text('Detalle de Pagos', 14, paymentsY);
    paymentsY += 4;

    autoTable(doc, {
      startY: paymentsY,
      head: [['Fecha', 'Monto', 'Notas']],
      body: data.payments.map(p => [
        p.date,
        `$${p.amount.toLocaleString()}`,
        p.notes || '—',
      ]),
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 247, 255] },
      columnStyles: {
        1: { halign: 'right', fontStyle: 'bold' },
      },
      margin: { left: 14, right: 14 },
    });

    const payFinalY = (doc as any).lastAutoTable.finalY + 8;

    // Payment summary
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text('Total pagado:', 14, payFinalY);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(`$${totalPaid.toLocaleString()}`, 70, payFinalY);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text('Saldo pendiente:', 110, payFinalY);
    doc.setFont('helvetica', 'bold');
    const remaining = data.totalAmount - totalPaid;
    doc.setTextColor(remaining > 0 ? 220 : 27, remaining > 0 ? 38 : 94, remaining > 0 ? 38 : 32);
    doc.text(`$${remaining.toLocaleString()}`, 160, payFinalY);
  } else {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(150, 150, 150);
    doc.text('Sin pagos registrados', 14, paymentsY);
  }

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `Documento generado automáticamente — Fundo360 — ${new Date().toLocaleDateString('es-CL')}`,
    105, 285, { align: 'center' }
  );

  // Download
  doc.save(`liquidacion-${data.workerName.replace(/\s+/g, '-').toLowerCase()}-${data.periodStart}.pdf`);
}

export function downloadSettlementPDF(blob: Blob, workerName: string, periodStart: string) {
  // Kept for backwards compat but not needed with jsPDF
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `liquidacion-${workerName.replace(/\s+/g, '-').toLowerCase()}-${periodStart}.pdf`;
  link.click();
  URL.revokeObjectURL(url);
}
