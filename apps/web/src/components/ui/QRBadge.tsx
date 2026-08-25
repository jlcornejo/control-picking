'use client';

import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';

interface QRBadgeProps {
  badgeId: string;
  workerName: string;
  role?: string;
}

export function QRBadge({ badgeId, workerName, role }: QRBadgeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!badgeId) return;
    generateBadge();
  }, [badgeId, workerName]);

  async function generateBadge() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = 400;
    const H = 520;
    canvas.width = W;
    canvas.height = H;

    // Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);

    // Header bar
    ctx.fillStyle = '#1b5e20';
    ctx.fillRect(0, 0, W, 60);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Control de Picking', W / 2, 38);

    // QR Code (centered)
    const qrSize = 260;
    const qrX = (W - qrSize) / 2;
    const qrY = 80;

    try {
      const qrDataUrl = await QRCode.toDataURL(badgeId, {
        width: qrSize,
        margin: 2,
        color: { dark: '#1b5e20', light: '#ffffff' },
        errorCorrectionLevel: 'H',
      });

      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, qrX, qrY, qrSize, qrSize);

        // Worker name
        ctx.fillStyle = '#111827';
        ctx.font = 'bold 22px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(workerName, W / 2, qrY + qrSize + 40);

        // Role
        if (role) {
          ctx.fillStyle = '#6b7280';
          ctx.font = '14px system-ui, sans-serif';
          ctx.fillText(role, W / 2, qrY + qrSize + 64);
        }

        // Badge ID (small, at bottom)
        ctx.fillStyle = '#9ca3af';
        ctx.font = '10px monospace';
        ctx.fillText(badgeId, W / 2, H - 20);

        // Border
        ctx.strokeStyle = '#e5e7eb';
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, W - 2, H - 2);

        setDataUrl(canvas.toDataURL('image/png'));
      };
      img.src = qrDataUrl;
    } catch (err) {
      console.error('Error generating QR:', err);
    }
  }

  function handleDownload() {
    if (!dataUrl) return;
    const link = document.createElement('a');
    link.download = `badge-${workerName.replace(/\s+/g, '-').toLowerCase()}.png`;
    link.href = dataUrl;
    link.click();
  }

  function handlePrint() {
    if (!dataUrl) return;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`
      <html><head><title>Badge - ${workerName}</title>
      <style>body{margin:0;display:flex;justify-content:center;align-items:center;min-height:100vh}img{max-width:100%;height:auto}@media print{body{margin:0}}</style>
      </head><body><img src="${dataUrl}" /><script>setTimeout(()=>window.print(),300)</script></body></html>
    `);
    win.document.close();
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <canvas ref={canvasRef} className="hidden" />
      {dataUrl ? (
        <>
          <img src={dataUrl} alt={`Badge QR de ${workerName}`} className="w-[200px] h-auto rounded-lg border border-border shadow-sm" />
          <div className="flex gap-2">
            <button onClick={handleDownload} className="rounded-xl px-4 py-2 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
              ↓ Descargar
            </button>
            <button onClick={handlePrint} className="rounded-xl px-4 py-2 text-xs font-medium border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
              🖨 Imprimir
            </button>
          </div>
        </>
      ) : (
        <div className="w-[200px] h-[260px] bg-muted animate-pulse rounded-lg" />
      )}
    </div>
  );
}
