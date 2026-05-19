import { ArrowLeft } from 'lucide-react';
import { navigateTo } from '../App.jsx';

export default function PlaceholderPage({ title }) {
  return (
    <main className="min-h-screen bg-[#f4f1ea] p-5 text-stone-950">
      <div className="mx-auto max-w-3xl rounded-lg border border-stone-200 bg-white p-5 shadow-panel">
        <button
          type="button"
          onClick={() => navigateTo('/pos')}
          className="inline-flex h-10 items-center gap-2 rounded-md border border-stone-200 px-3 text-sm font-bold hover:bg-stone-50"
        >
          <ArrowLeft size={17} />
          POS
        </button>
        <h1 className="mt-5 text-2xl font-black">{title}</h1>
        <p className="mt-2 text-sm font-semibold text-stone-500">ล้านก๋างโต้ง</p>
      </div>
    </main>
  );
}

