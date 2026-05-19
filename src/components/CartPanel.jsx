import { Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import Badge from './Badge.jsx';
import Input from './Input.jsx';

function formatMoney(value) {
  return new Intl.NumberFormat('th-TH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value || 0);
}

export default function CartPanel({
  cart,
  orderType,
  tableNo,
  note,
  discount,
  totals,
  onOrderTypeChange,
  onTableNoChange,
  onNoteChange,
  onDiscountChange,
  onIncrease,
  onDecrease,
  onRemove,
  onItemNoteChange,
}) {
  return (
    <section className="flex flex-col overflow-hidden rounded-[26px] border border-[#eadbc9] bg-white shadow-xl shadow-stone-900/5">
      <div className="border-b border-[#eadbc9] bg-gradient-to-r from-[#fffaf3] to-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#f1e2d3] text-[#5b3b27]">
              <ShoppingBag size={20} />
            </span>
            <div>
              <h2 className="text-lg font-black text-stone-950">รายการขาย</h2>
              <p className="text-xs font-semibold text-stone-500">บิลสำหรับลูกค้ารายนี้</p>
            </div>
          </div>
          <Badge tone="coffee">{cart.length} รายการ</Badge>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl bg-[#f1e6da] p-1.5">
          {['TAKEAWAY', 'DINE_IN'].map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => onOrderTypeChange(type)}
              className={`h-11 rounded-xl text-sm font-black transition active:scale-[0.98] ${
                orderType === type
                  ? 'bg-[#0f0b08] text-white shadow-md shadow-stone-950/15'
                  : 'text-stone-600 hover:bg-white'
              }`}
            >
              {type}
            </button>
          ))}
        </div>

        {orderType === 'DINE_IN' ? (
          <Input
            value={tableNo}
            onChange={(event) => onTableNoChange(event.target.value)}
            placeholder="Table no"
            className="mt-3 w-full rounded-2xl border-[#eadbc9] bg-white"
          />
        ) : null}
      </div>

      <div className="max-h-[340px] space-y-3 overflow-y-auto p-4">
        {cart.length === 0 ? (
          <div className="flex min-h-[150px] flex-col items-center justify-center rounded-[22px] border border-dashed border-[#d8c2a9] bg-[#fffaf3] text-center">
            <ShoppingBag className="text-stone-300" size={34} />
            <p className="mt-2 text-sm font-black text-stone-500">ยังไม่มีสินค้า</p>
            <p className="mt-1 text-xs font-semibold text-stone-400">แตะเมนูด้านซ้ายเพื่อเพิ่มลงบิล</p>
          </div>
        ) : (
          cart.map((item) => (
            <div key={item.cart_id} className="rounded-[22px] border border-[#eadbc9] bg-white p-3 shadow-sm shadow-stone-900/5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="line-clamp-2 text-sm font-black text-stone-950">{item.menu_name}</p>
                  <p className="mt-1 text-xs font-semibold text-stone-500">฿{formatMoney(item.unit_price)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(item.cart_id)}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-stone-400 transition hover:bg-rose-50 hover:text-rose-600"
                  title="Remove"
                  aria-label="Remove item"
                >
                  <Trash2 size={17} />
                </button>
              </div>

              <div className="mt-3 flex items-center justify-between gap-2">
                <div className="flex items-center rounded-2xl bg-[#f4ede6] p-1">
                  <button
                    type="button"
                    onClick={() => onDecrease(item.cart_id)}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-stone-700 transition hover:bg-white"
                    title="Decrease"
                    aria-label="Decrease quantity"
                  >
                    <Minus size={17} />
                  </button>
                  <span className="w-10 text-center text-base font-black">{item.quantity}</span>
                  <button
                    type="button"
                    onClick={() => onIncrease(item.cart_id)}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-stone-700 transition hover:bg-white"
                    title="Increase"
                    aria-label="Increase quantity"
                  >
                    <Plus size={17} />
                  </button>
                </div>
                <p className="text-base font-black text-stone-950">฿{formatMoney(item.total)}</p>
              </div>

              <Input
                value={item.note}
                onChange={(event) => onItemNoteChange(item.cart_id, event.target.value)}
                placeholder="Item note"
                className="mt-3 h-10 w-full rounded-xl border-[#eadbc9] bg-[#fffaf6] text-xs"
              />
            </div>
          ))
        )}
      </div>

      <div className="border-t border-[#eadbc9] bg-[#fffaf3] p-4">
        <Input
          as="textarea"
          value={note}
          onChange={(event) => onNoteChange(event.target.value)}
          placeholder="Order note"
          rows={2}
          className="w-full resize-none rounded-2xl border-[#eadbc9]"
        />
        <label className="mt-3 block text-xs font-bold uppercase tracking-wide text-stone-500">
          Discount
          <Input
            value={discount}
            onChange={(event) => onDiscountChange(event.target.value)}
            inputMode="decimal"
            className="mt-1 w-full rounded-2xl border-[#eadbc9]"
          />
        </label>

        <div className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between text-stone-500">
            <span>Subtotal</span>
            <span>฿{formatMoney(totals.subtotal)}</span>
          </div>
          <div className="flex justify-between text-stone-500">
            <span>Discount</span>
            <span>฿{formatMoney(totals.discount)}</span>
          </div>
          <div className="mt-3 flex items-center justify-between rounded-[20px] bg-[#0f0b08] px-4 py-3 text-white shadow-lg shadow-stone-950/10">
            <span className="text-sm font-black">Total</span>
            <span className="text-2xl font-black">฿{formatMoney(totals.total)}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
