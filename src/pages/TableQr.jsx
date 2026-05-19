import React from 'react';
import QRCode from 'qrcode';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Printer,
  QrCode,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import { getTables, getTableQrLinks, regenerateTableQrTokens } from '../services/api.js';
import { navigateTo } from '../App.jsx';
import { PRODUCTION_ORDER_URL } from '../services/router.js';
import AppShell from '../components/AppShell.jsx';
import Button from '../components/Button.jsx';
import Input from '../components/Input.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { getTableDisplayName } from '../utils/tableDisplay.js';

const ADMIN_TOKEN_KEY = 'LGT_ADMIN_TOKEN';

function getDefaultBaseUrl() {
  return PRODUCTION_ORDER_URL;
}

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/[?&]+$/, '');
}

export default function TableQr() {
  const [baseUrl, setBaseUrl] = React.useState(getDefaultBaseUrl);
  const [qrCards, setQrCards] = React.useState([]);
  const [adminToken, setAdminToken] = React.useState(() => window.sessionStorage.getItem(ADMIN_TOKEN_KEY) || '');
  const [confirmation, setConfirmation] = React.useState('');
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [isRegenerating, setIsRegenerating] = React.useState(false);
  const [error, setError] = React.useState('');
  const [message, setMessage] = React.useState('');

  async function buildQrCards(links) {
    return Promise.all(
      links.map(async (link) => ({
        ...link,
        qr_image: await QRCode.toDataURL(link.qr_url, {
          width: 360,
          margin: 1,
          errorCorrectionLevel: 'M',
        }),
      })),
    );
  }

  async function handleGenerateLinks() {
    const cleanBaseUrl = normalizeBaseUrl(baseUrl);

    if (!cleanBaseUrl) {
      setError('Please enter the frontend /order URL.');
      return;
    }

    setIsGenerating(true);
    setError('');
    setMessage('');

    try {
      const result = await getTableQrLinks(cleanBaseUrl);

      if (!result.success) {
        throw new Error(result.message || 'GET_TABLE_QR_LINKS failed');
      }

      const cards = await buildQrCards(result.qr_links || []);
      setBaseUrl(result.base_url || cleanBaseUrl);
      setQrCards(cards);
      setMessage(`Generated ${cards.length} table QR cards.`);
    } catch (generateError) {
      setError(generateError.message || 'Cannot generate table QR links');
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleRegenerateTokens() {
    const cleanToken = adminToken.trim();

    if (!cleanToken) {
      setError('Please enter admin token.');
      return;
    }

    if (confirmation !== 'REGENERATE') {
      setError('Type REGENERATE to confirm token regeneration.');
      return;
    }

    setIsRegenerating(true);
    setError('');
    setMessage('');

    try {
      const result = await regenerateTableQrTokens(cleanToken);

      if (!result.success) {
        throw new Error(result.message || 'REGENERATE_TABLE_QR_TOKENS failed');
      }

      await getTables({ forceRefresh: true });
      window.sessionStorage.setItem(ADMIN_TOKEN_KEY, cleanToken);
      setMessage(result.message || 'Table QR tokens regenerated');
      setConfirmation('');

      if (normalizeBaseUrl(baseUrl)) {
        await handleGenerateLinks();
      }
    } catch (regenerateError) {
      setError(regenerateError.message || 'Cannot regenerate table QR tokens');
    } finally {
      setIsRegenerating(false);
    }
  }

  return (
    <AppShell
      title="QR โต๊ะ"
      subtitle="สร้างและพิมพ์ QR สำหรับสั่งอาหารที่โต๊ะ"
      actions={
        <>
          <Button onClick={() => navigateTo('/admin')} variant="ghost">
            Admin
          </Button>
          <Button onClick={() => window.print()} disabled={!qrCards.length}>
            <Printer size={18} />
            Print QR โต๊ะ
          </Button>
        </>
      }
    >
      <style>
        {`
          @media print {
            @page { size: A4; margin: 10mm; }
            body * { visibility: hidden; }
            .table-qr-print, .table-qr-print * { visibility: visible; }
            .table-qr-print { position: absolute; inset: 0; background: white; padding: 0; }
            .table-qr-toolbar { display: none !important; }
            .table-qr-grid { display: grid !important; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8mm; }
            .table-qr-card { break-inside: avoid; box-shadow: none !important; border: 1px solid #111827 !important; }
          }
        `}
      </style>

      {error ? (
        <div className="mb-4 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700 shadow-sm">
          <AlertTriangle className="mt-0.5 shrink-0" size={18} />
          <span>{error}</span>
        </div>
      ) : null}

      {message ? (
        <div className="mb-4 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-700 shadow-sm">
          <CheckCircle2 className="mt-0.5 shrink-0" size={18} />
          <span>{message}</span>
        </div>
      ) : null}

      <section className="table-qr-toolbar rounded-[30px] border border-[#eadbc9] bg-white/85 p-4 shadow-2xl shadow-stone-900/5 backdrop-blur">
        <div className="flex flex-col gap-4 rounded-[24px] border border-[#eadbc9] bg-[#fffaf3] p-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-[#5b3b27] shadow-sm ring-1 ring-[#eadbc9]">
                <QrCode size={20} />
              </span>
              <div>
                <h2 className="text-xl font-black text-stone-950">Production QR Links</h2>
                <p className="text-sm font-semibold text-stone-500">
                  ควร Generate QR จริงหลัง Deploy GitHub Pages แล้วเท่านั้น
                </p>
              </div>
            </div>
            <label className="mt-4 block text-xs font-bold uppercase tracking-wide text-stone-500">
              Frontend base order URL
              <Input
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                placeholder={PRODUCTION_ORDER_URL}
                className="mt-1 w-full rounded-2xl border-[#eadbc9]"
              />
            </label>
          </div>

          <Button onClick={handleGenerateLinks} disabled={isGenerating} size="lg" variant="dark">
            <RefreshCw size={18} className={isGenerating ? 'animate-spin' : ''} />
            Generate QR Links
          </Button>
        </div>
      </section>

      <section className="table-qr-toolbar mt-5 rounded-[30px] border border-rose-200 bg-gradient-to-br from-rose-50 to-white p-4 shadow-xl shadow-stone-900/5">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-rose-700 shadow-sm ring-1 ring-rose-200">
            <ShieldAlert size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-black text-rose-950">Advanced: Regenerate QR Tokens</h2>
            <p className="mt-1 text-sm font-semibold text-rose-800/80">
              This will invalidate all existing printed table QR codes. Use only before printing new production QR cards.
              All tables must be AVAILABLE.
            </p>
            <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_190px]">
              <Input
                type="password"
                value={adminToken}
                onChange={(event) => setAdminToken(event.target.value)}
                placeholder="Admin token"
                className="rounded-2xl border-rose-200"
              />
              <Input
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                placeholder="Type REGENERATE"
                className="rounded-2xl border-rose-200"
              />
              <Button
                onClick={handleRegenerateTokens}
                disabled={isRegenerating || confirmation !== 'REGENERATE'}
                variant="danger"
                className="rounded-2xl"
              >
                <RefreshCw size={18} className={isRegenerating ? 'animate-spin' : ''} />
                Regenerate
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="table-qr-print mt-5 rounded-[30px] border border-[#eadbc9] bg-white/85 p-4 shadow-2xl shadow-stone-900/5">
        <div className="table-qr-toolbar mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-black text-stone-950">Printable QR Cards</h2>
            <p className="text-sm font-semibold text-stone-500">2 cards per row on A4 when printing</p>
          </div>
          <StatusBadge tone={qrCards.length ? 'success' : 'neutral'}>{qrCards.length} cards</StatusBadge>
        </div>

        {qrCards.length ? (
          <div className="table-qr-grid grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {qrCards.map((card) => {
              const tableDisplayName = getTableDisplayName(card.table_no, card.table_name || card.table_no);
              const shouldShowTableCode = String(card.table_no || '').toUpperCase() !== 'T10';

              return (
              <article
                key={card.table_no}
                className="table-qr-card rounded-[28px] border border-[#eadbc9] bg-white p-5 text-center shadow-xl shadow-stone-900/5"
              >
                <p className="text-sm font-black uppercase tracking-[0.18em] text-[#8a6a4f]">ล้านก๋างโต้ง</p>
                <h3 className="mt-2 text-4xl font-black text-stone-950">{tableDisplayName}</h3>
                {shouldShowTableCode ? (
                  <p className="mt-1 text-sm font-bold text-stone-500">{card.table_no}</p>
                ) : null}
                <div className="mx-auto mt-4 w-fit rounded-[24px] bg-white p-3 shadow-sm ring-1 ring-[#eadbc9]">
                  <img src={card.qr_image} alt={`${tableDisplayName} QR`} className="h-48 w-48" />
                </div>
                <p className="mt-4 text-lg font-black text-stone-950">สแกนเพื่อสั่งอาหาร</p>
                <p className="mt-1 text-xs font-semibold text-stone-500">Scan with your phone camera</p>
                <a
                  href={card.qr_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center justify-center gap-1 text-xs font-bold text-[#6f4e37] table-qr-toolbar"
                >
                  Test link
                  <ExternalLink size={13} />
                </a>
              </article>
              );
            })}
          </div>
        ) : (
          <div className="flex h-56 flex-col items-center justify-center rounded-[24px] border border-dashed border-[#d8c2a9] bg-[#fffaf3] text-center text-sm font-bold text-stone-400">
            <QrCode size={34} />
            <p className="mt-2">Enter production /order URL and generate QR links.</p>
          </div>
        )}
      </section>
    </AppShell>
  );
}
