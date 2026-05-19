import React from 'react';
import { ImageOff, Plus, Star } from 'lucide-react';
import Badge from './Badge.jsx';

function formatMoney(value) {
  return new Intl.NumberFormat('th-TH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value || 0);
}

export default function MenuCard({ menu, onAdd }) {
  const hasStockWarning = menu.track_stock && menu.stock_mode === 'DIRECT' && menu.stock_qty <= 0;
  const isDirectStock = menu.track_stock && menu.stock_mode === 'DIRECT';
  const [imageFailed, setImageFailed] = React.useState(false);
  const imageUrl = typeof menu.image_url === 'string' ? menu.image_url.trim() : '';
  const shouldShowImage = imageUrl.startsWith('https://') && !imageFailed;

  React.useEffect(() => {
    setImageFailed(false);
  }, [imageUrl]);

  return (
    <article className="group flex min-h-[308px] flex-col overflow-hidden rounded-[26px] border border-[#eadbc9] bg-white shadow-sm shadow-stone-900/5 transition duration-200 hover:-translate-y-1 hover:border-[#d2b899] hover:shadow-2xl hover:shadow-stone-900/10 active:translate-y-0">
      <div className="relative aspect-[5/4] w-full overflow-hidden bg-[#efe5da]">
        {shouldShowImage ? (
          <img
            src={imageUrl}
            alt={menu.menu_name}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#efe5da] to-[#fff7ef] text-[#a78b73]">
            <ImageOff size={34} aria-hidden="true" />
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-stone-950/25 to-transparent opacity-0 transition group-hover:opacity-100" />

        <div className="absolute left-3 top-3 flex flex-wrap gap-2">
          {menu.is_recommended ? (
            <Badge tone="warning" className="bg-white/95 shadow-sm">
              <Star size={13} fill="currentColor" />
              แนะนำ
            </Badge>
          ) : null}
          {isDirectStock ? (
            <Badge tone={hasStockWarning ? 'danger' : 'success'} className="bg-white/95 shadow-sm">
              คงเหลือ {formatMoney(menu.stock_qty)}
            </Badge>
          ) : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col justify-between p-4">
        <div className="min-w-0">
          <h3 className="line-clamp-2 text-base font-black leading-snug text-stone-950">{menu.menu_name}</h3>
          {menu.menu_name_en ? (
            <p className="mt-1 truncate text-xs font-semibold text-stone-500">{menu.menu_name_en}</p>
          ) : null}
          {menu.description ? <p className="mt-2 line-clamp-2 text-sm text-stone-500">{menu.description}</p> : null}
        </div>

        <div className="mt-4 flex items-end justify-between gap-3">
          <div>
            <p className="text-2xl font-black text-[#3f2a1d]">฿{formatMoney(menu.base_price)}</p>
            {hasStockWarning ? <p className="text-xs font-bold text-rose-600">สินค้าหมด</p> : null}
          </div>
          <button
            type="button"
            onClick={() => onAdd(menu)}
            disabled={hasStockWarning}
            className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0f0b08] text-white shadow-lg shadow-stone-950/15 transition hover:bg-[#5b3f2d] active:scale-95 disabled:cursor-not-allowed disabled:bg-stone-300 disabled:shadow-none"
            title="Add item"
            aria-label={`Add ${menu.menu_name}`}
          >
            <Plus size={22} />
          </button>
        </div>
      </div>
    </article>
  );
}
