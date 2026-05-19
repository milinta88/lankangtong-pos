import React from 'react';
import { AlertTriangle, Check, ImagePlus, QrCode, RefreshCw, Save, Search, Settings, SlidersHorizontal } from 'lucide-react';
import { getAdminMenus, getCachedAdminMenusResponse, updateMenuBasic, uploadMenuImage } from '../services/api.js';
import { navigateTo } from '../App.jsx';
import AppShell from '../components/AppShell.jsx';
import Button from '../components/Button.jsx';
import Input from '../components/Input.jsx';
import QrNotificationControls from '../components/QrNotificationControls.jsx';
import StatCard from '../components/StatCard.jsx';
import StatusBadge from '../components/StatusBadge.jsx';

const editableFields = [
  'price',
  'image_url',
  'is_available',
  'is_recommended',
  'track_stock',
  'stock_mode',
  'stock_qty',
  'low_stock_level',
];

const allowedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const maxImageSize = 800;
const imageQuality = 0.8;

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizeMenu(menu) {
  return {
    menu_id: menu.menu_id || '',
    category_id: menu.category_id || '',
    name_th: menu.name_th || '',
    price: toNumber(menu.price),
    image_url: menu.image_url || '',
    image_view_url: menu.image_view_url || menu.view_url || '',
    is_available: Boolean(menu.is_available),
    is_recommended: Boolean(menu.is_recommended),
    track_stock: Boolean(menu.track_stock),
    stock_mode: menu.stock_mode || 'NONE',
    stock_qty: toNumber(menu.stock_qty),
    low_stock_level: toNumber(menu.low_stock_level),
    sort_order: toNumber(menu.sort_order),
  };
}

function formatMoney(value) {
  return new Intl.NumberFormat('th-TH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(toNumber(value));
}

function getMenuPatch(original, draft) {
  const patch = {};

  editableFields.forEach((field) => {
    if (draft[field] !== original[field]) {
      patch[field] = draft[field];
    }
  });

  return patch;
}

function isDirty(original, draft) {
  return Object.keys(getMenuPatch(original, draft)).length > 0;
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('ไม่สามารถอ่านไฟล์รูปภาพได้'));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }

        reject(new Error('ไม่สามารถบีบอัดรูปภาพได้'));
      },
      type,
      quality,
    );
  });
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = String(reader.result || '');
      resolve(result.includes(',') ? result.split(',').pop() : result);
    };
    reader.onerror = () => reject(new Error('ไม่สามารถแปลงรูปภาพได้'));
    reader.readAsDataURL(blob);
  });
}

async function prepareMenuImageUpload(file) {
  if (!file) {
    throw new Error('กรุณาเลือกไฟล์รูปภาพ');
  }

  if (!allowedImageTypes.has(file.type)) {
    throw new Error('รองรับเฉพาะไฟล์ JPG, PNG หรือ WebP');
  }

  const image = await loadImageFromFile(file);
  const scale = Math.min(1, maxImageSize / image.width, maxImageSize / image.height);
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const outputType = file.type === 'image/webp' ? 'image/webp' : 'image/jpeg';
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Browser ไม่รองรับการบีบอัดรูปภาพ');
  }

  canvas.width = width;
  canvas.height = height;
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  const blob = await canvasToBlob(canvas, outputType, imageQuality);
  const base64 = await blobToBase64(blob);

  return {
    filename: file.name || 'menu-image',
    mime_type: outputType,
    base64,
  };
}

function MenuImage({ menu, onLoadFailed }) {
  const [failed, setFailed] = React.useState(false);
  const imageUrl = typeof menu.image_url === 'string' ? menu.image_url.trim() : '';
  const shouldShowImage = imageUrl.startsWith('https://') && !failed;

  React.useEffect(() => {
    setFailed(false);
  }, [imageUrl]);

  return (
    <div className="h-14 w-14 overflow-hidden rounded-2xl bg-[#efe5da] shadow-sm ring-1 ring-[#eadbc9]">
      {shouldShowImage ? (
        <img
          src={imageUrl}
          alt={menu.name_th}
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => {
            setFailed(true);
            onLoadFailed?.();
          }}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#efe5da] to-[#fff7ef] text-xs font-black text-[#a78b73]">
          POS
        </div>
      )}
    </div>
  );
}

function ToggleCell({ checked, label, onChange }) {
  return (
    <label className="inline-flex items-center gap-2 rounded-full bg-[#fffaf3] px-2.5 py-1.5 text-sm font-bold text-stone-700 ring-1 ring-[#eadbc9]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-5 w-5 rounded border-stone-300 text-[#6f4e37] focus:ring-[#6f4e37]"
      />
      {label}
    </label>
  );
}

export default function Admin() {
  const cachedAdminMenus = React.useMemo(() => getCachedAdminMenusResponse(), []);
  const cachedNormalizedMenus = React.useMemo(
    () => (cachedAdminMenus?.success ? (cachedAdminMenus.menus || []).map(normalizeMenu) : []),
    [cachedAdminMenus],
  );
  const [menus, setMenus] = React.useState(() => cachedNormalizedMenus);
  const [originalMenus, setOriginalMenus] = React.useState(() => {
    const originals = {};
    cachedNormalizedMenus.forEach((menu) => {
      originals[menu.menu_id] = { ...menu };
    });
    return originals;
  });
  const [search, setSearch] = React.useState('');
  const [activeCategory, setActiveCategory] = React.useState('ALL');
  const [savingRows, setSavingRows] = React.useState({});
  const [uploadingRows, setUploadingRows] = React.useState({});
  const [rowMessages, setRowMessages] = React.useState({});
  const [error, setError] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(() => !cachedAdminMenus?.success);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const hasLoadedMenusRef = React.useRef(Boolean(cachedAdminMenus?.success));
  const isMountedRef = React.useRef(false);
  const adminMenusRequestIdRef = React.useRef(0);

  React.useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadMenus = React.useCallback(async ({ force = false, clearMessages = true } = {}) => {
    const requestId = adminMenusRequestIdRef.current + 1;
    adminMenusRequestIdRef.current = requestId;
    const showFullLoading = !hasLoadedMenusRef.current;

    if (showFullLoading) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }
    setError('');
    if (clearMessages) {
      setRowMessages({});
    }

    try {
      const result = await getAdminMenus({ force });

      if (!result.success) {
        throw new Error(result.message || 'GET_ADMIN_MENUS failed');
      }

      if (!isMountedRef.current || adminMenusRequestIdRef.current !== requestId) {
        return;
      }

      const nextMenus = (result.menus || []).map(normalizeMenu);
      const nextOriginals = {};

      nextMenus.forEach((menu) => {
        nextOriginals[menu.menu_id] = { ...menu };
      });

      setMenus(nextMenus);
      setOriginalMenus(nextOriginals);
      hasLoadedMenusRef.current = true;
    } catch (loadError) {
      if (isMountedRef.current && adminMenusRequestIdRef.current === requestId) {
        setError(loadError.message || 'Cannot load admin menus');
      }
    } finally {
      if (isMountedRef.current && adminMenusRequestIdRef.current === requestId) {
        if (showFullLoading) {
          setIsLoading(false);
        } else {
          setIsRefreshing(false);
        }
      }
    }
  }, []);

  React.useEffect(() => {
    loadMenus();
  }, [loadMenus]);

  const categories = React.useMemo(() => {
    return Array.from(new Set(menus.map((menu) => menu.category_id).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b),
    );
  }, [menus]);

  React.useEffect(() => {
    if (activeCategory !== 'ALL' && !categories.includes(activeCategory)) {
      setActiveCategory('ALL');
    }
  }, [activeCategory, categories]);

  const filteredMenus = React.useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return menus.filter((menu) => {
      const matchesSearch =
        !keyword ||
        menu.menu_id.toLowerCase().includes(keyword) ||
        menu.name_th.toLowerCase().includes(keyword) ||
        menu.category_id.toLowerCase().includes(keyword);
      const matchesCategory = activeCategory === 'ALL' || menu.category_id === activeCategory;

      return matchesSearch && matchesCategory;
    });
  }, [activeCategory, menus, search]);

  function updateDraft(menuId, field, value) {
    setMenus((current) =>
      current.map((menu) => (menu.menu_id === menuId ? { ...menu, [field]: value } : menu)),
    );
    setRowMessages((current) => ({ ...current, [menuId]: '' }));
  }

  async function saveMenu(menu) {
    const original = originalMenus[menu.menu_id];

    if (!original) return;

    const patch = getMenuPatch(original, menu);

    if (!Object.keys(patch).length) {
      return;
    }

    setSavingRows((current) => ({ ...current, [menu.menu_id]: true }));
    setRowMessages((current) => ({ ...current, [menu.menu_id]: '' }));

    try {
      const result = await updateMenuBasic(menu.menu_id, patch);

      if (!result.success) {
        throw new Error(result.message || 'UPDATE_MENU_BASIC failed');
      }

      if (!isMountedRef.current) {
        return;
      }

      const updatedMenu = normalizeMenu(result.menu || menu);

      setMenus((current) => current.map((item) => (item.menu_id === updatedMenu.menu_id ? updatedMenu : item)));
      setOriginalMenus((current) => ({ ...current, [updatedMenu.menu_id]: { ...updatedMenu } }));
      setRowMessages((current) => ({ ...current, [updatedMenu.menu_id]: 'Saved' }));
      await loadMenus({ force: true, clearMessages: false });
    } catch (saveError) {
      if (isMountedRef.current) {
        setRowMessages((current) => ({
          ...current,
          [menu.menu_id]: saveError.message || 'Cannot save menu',
        }));
      }
    } finally {
      if (isMountedRef.current) {
        setSavingRows((current) => ({ ...current, [menu.menu_id]: false }));
      }
    }
  }

  async function uploadImageForMenu(menu, file) {
    if (!menu?.menu_id || !file) return;

    setUploadingRows((current) => ({ ...current, [menu.menu_id]: true }));
    setRowMessages((current) => ({ ...current, [menu.menu_id]: '' }));

    try {
      const preparedImage = await prepareMenuImageUpload(file);
      const result = await uploadMenuImage({
        menu_id: menu.menu_id,
        filename: preparedImage.filename,
        mime_type: preparedImage.mime_type,
        base64: preparedImage.base64,
        update_menu: true,
      });

      if (!result.success) {
        throw new Error(result.message || 'UPLOAD_MENU_IMAGE failed');
      }

      if (!isMountedRef.current) {
        return;
      }

      const nextImageUrl = result.image_url || result.menu?.image_url || '';
      const nextViewUrl = result.view_url || '';

      setMenus((current) =>
        current.map((item) => (
          item.menu_id === menu.menu_id
            ? { ...item, image_url: nextImageUrl, image_view_url: nextViewUrl }
            : item
        )),
      );
      setOriginalMenus((current) => ({
        ...current,
        [menu.menu_id]: {
          ...(current[menu.menu_id] || menu),
          image_url: nextImageUrl,
          image_view_url: nextViewUrl,
        },
      }));
      setRowMessages((current) => ({ ...current, [menu.menu_id]: 'Uploaded' }));
    } catch (uploadError) {
      if (isMountedRef.current) {
        setRowMessages((current) => ({
          ...current,
          [menu.menu_id]: uploadError.message || 'อัปโหลดรูปไม่สำเร็จ',
        }));
      }
    } finally {
      if (isMountedRef.current) {
        setUploadingRows((current) => ({ ...current, [menu.menu_id]: false }));
      }
    }
  }

  return (
    <AppShell
      title="Admin"
      subtitle="จัดการเมนู ราคา และสต็อกพื้นฐาน"
      actions={
        <>
          <Button onClick={() => navigateTo('/table-qr')} variant="ghost">
            <QrCode size={18} />
            QR โต๊ะ
          </Button>
          <Button onClick={() => loadMenus({ force: true })} disabled={isLoading || isRefreshing}>
            <RefreshCw size={18} className={isLoading || isRefreshing ? 'animate-spin' : ''} />
            Refresh
          </Button>
        </>
      }
    >
        {error ? (
          <div className="mb-4 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700 shadow-sm">
            <AlertTriangle className="mt-0.5 shrink-0" size={18} />
            <span>{error}</span>
          </div>
        ) : null}

        <section className="mb-5 rounded-[30px] border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-4 shadow-xl shadow-amber-900/5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-xl font-black text-stone-950">ตั้งค่าแจ้งเตือน QR</h2>
              <p className="mt-1 max-w-3xl text-sm font-semibold text-amber-800">
                แจ้งเตือนจะทำงานเมื่อเปิดเว็บแอพค้างไว้ แม้พับหน้าต่างหรืออยู่แท็บอื่น แต่ถ้าปิด Browser/Tab แล้วจะไม่แจ้งเตือน
              </p>
            </div>
            <QrNotificationControls />
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <StatCard icon={Settings} label="เมนูทั้งหมด" value={menus.length} tone="coffee" />
          <StatCard icon={Check} label="เปิดขาย" value={menus.filter((menu) => menu.is_available).length} tone="success" />
          <StatCard icon={SlidersHorizontal} label="DIRECT stock" value={menus.filter((menu) => menu.stock_mode === 'DIRECT').length} tone="warning" />
        </section>

        <section className="mt-5 rounded-[30px] border border-[#eadbc9] bg-white/85 p-4 shadow-2xl shadow-stone-900/5 backdrop-blur">
          <div className="flex flex-col gap-4 rounded-[24px] border border-[#eadbc9] bg-[#fffaf3] p-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-black">Menu settings</h2>
              <p className="text-sm font-semibold text-stone-500">แก้ไขเฉพาะราคา สถานะขาย และสต็อกพื้นฐาน</p>
              {isRefreshing ? (
                <p className="mt-1 text-xs font-bold text-stone-500">ข้อมูลล่าสุด กำลังอัปเดต...</p>
              ) : null}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:items-center">
              <select
                value={activeCategory}
                onChange={(event) => setActiveCategory(event.target.value)}
                className="h-11 rounded-2xl border border-[#eadbc9] bg-white px-3 text-sm font-bold outline-none ring-[#6f4e37] focus:ring-2"
                aria-label="Filter by category"
              >
                <option value="ALL">ทุกหมวดหมู่</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
              <div className="relative w-full sm:w-[320px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search menu"
                  className="w-full rounded-2xl border-[#eadbc9] pl-10"
                />
              </div>
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-[24px] border border-[#eadbc9] bg-white shadow-sm">
            <div className="max-h-[calc(100vh-290px)] overflow-auto">
              <table className="w-full min-w-[1180px] text-left text-sm">
                <thead className="sticky top-0 z-10 bg-[#f6efe7] text-xs uppercase text-[#7a5b43]">
                  <tr>
                    <th className="px-4 py-3">เมนู</th>
                    <th className="px-4 py-3 text-right">ราคา</th>
                    <th className="px-4 py-3">สถานะ</th>
                    <th className="px-4 py-3">แนะนำ</th>
                    <th className="px-4 py-3">ตัดสต็อก</th>
                    <th className="px-4 py-3">Stock mode</th>
                    <th className="px-4 py-3 text-right">คงเหลือ</th>
                    <th className="px-4 py-3 text-right">จุดเตือน</th>
                    <th className="px-4 py-3">Save</th>
                  </tr>
                </thead>
                <tbody>
                  {!isLoading &&
                    filteredMenus.map((menu) => {
                      const original = originalMenus[menu.menu_id] || menu;
                      const dirty = isDirty(original, menu);
                      const isSaving = Boolean(savingRows[menu.menu_id]);
                      const isUploading = Boolean(uploadingRows[menu.menu_id]);
                      const rowMessage = rowMessages[menu.menu_id];

                      return (
                        <tr key={menu.menu_id} className={`border-t border-[#eadbc9] align-top transition ${dirty ? 'bg-amber-50/60' : 'hover:bg-[#fffaf3]'}`}>
                          <td className="px-4 py-3">
                            <div className="min-w-[320px]">
                              <div className="flex items-center gap-3">
                                <MenuImage
                                  menu={menu}
                                  onLoadFailed={() => {
                                    if (menu.image_view_url && rowMessages[menu.menu_id] === 'Uploaded') {
                                      setRowMessages((current) => ({
                                        ...current,
                                        [menu.menu_id]: 'อัปโหลดสำเร็จ แต่โหลดรูปตัวอย่างไม่ได้ ลองรีเฟรชหรือเปิด view_url เพื่อตรวจสอบ',
                                      }));
                                    }
                                  }}
                                />
                                <div className="min-w-0">
                                  <p className="font-black text-stone-950">{menu.name_th || menu.menu_id}</p>
                                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-semibold text-stone-500">
                                    <span>{menu.menu_id}</span>
                                    {menu.category_id ? <span>{menu.category_id}</span> : null}
                                    <span className="font-black text-[#4b3020]">฿{formatMoney(menu.price)}</span>
                                  </div>
                                </div>
                              </div>
                              <div className="mt-3 flex items-center gap-2">
                                <label className={`inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-2xl px-3 text-xs font-black shadow-sm transition ${
                                  isUploading
                                    ? 'cursor-not-allowed bg-stone-300 text-white'
                                    : 'cursor-pointer bg-[#6f4e37] text-white hover:bg-[#5b3f2d]'
                                }`}>
                                  <ImagePlus size={15} />
                                  {isUploading ? 'กำลังอัปโหลด...' : 'Upload รูป'}
                                  <input
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp"
                                    className="hidden"
                                    disabled={isUploading}
                                    onChange={(event) => {
                                      const file = event.target.files?.[0];
                                      event.target.value = '';
                                      uploadImageForMenu(menu, file);
                                    }}
                                  />
                                </label>
                                <Input
                                  value={menu.image_url}
                                  onChange={(event) => updateDraft(menu.menu_id, 'image_url', event.target.value)}
                                  placeholder="image_url"
                                  className="h-9 min-w-0 rounded-xl border-[#eadbc9] text-xs font-semibold"
                                />
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Input
                              type="number"
                              min="0"
                              value={menu.price}
                              onChange={(event) => updateDraft(menu.menu_id, 'price', toNumber(event.target.value))}
                              className="h-10 w-24 rounded-xl border-[#eadbc9] text-right font-black"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <ToggleCell
                              checked={menu.is_available}
                              label={menu.is_available ? 'เปิดขาย' : 'ปิด'}
                              onChange={(value) => updateDraft(menu.menu_id, 'is_available', value)}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <ToggleCell
                              checked={menu.is_recommended}
                              label="แนะนำ"
                              onChange={(value) => updateDraft(menu.menu_id, 'is_recommended', value)}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <ToggleCell
                              checked={menu.track_stock}
                              label="Track"
                              onChange={(value) => updateDraft(menu.menu_id, 'track_stock', value)}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <select
                              value={menu.stock_mode}
                              onChange={(event) => updateDraft(menu.menu_id, 'stock_mode', event.target.value)}
                              className="h-10 rounded-xl border border-[#eadbc9] bg-white px-2 text-sm font-bold outline-none ring-[#6f4e37] focus:ring-2"
                            >
                              <option value="NONE">NONE</option>
                              <option value="DIRECT">DIRECT</option>
                              <option value="RECIPE">RECIPE</option>
                            </select>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Input
                              type="number"
                              value={menu.stock_qty}
                              onChange={(event) => updateDraft(menu.menu_id, 'stock_qty', toNumber(event.target.value))}
                              className="h-10 w-24 rounded-xl border-[#eadbc9] text-right font-black"
                            />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Input
                              type="number"
                              min="0"
                              value={menu.low_stock_level}
                              onChange={(event) => updateDraft(menu.menu_id, 'low_stock_level', toNumber(event.target.value))}
                              className="h-10 w-24 rounded-xl border-[#eadbc9] text-right font-black"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-2">
                              <button
                                type="button"
                                onClick={() => saveMenu(menu)}
                                disabled={!dirty || isSaving}
                                className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-[#0f0b08] px-3 text-sm font-black text-white shadow-sm transition hover:bg-[#5b3f2d] disabled:cursor-not-allowed disabled:bg-stone-300 disabled:shadow-none"
                              >
                                <Save size={16} />
                                {isSaving ? 'Saving' : 'Save'}
                              </button>
                              {rowMessage ? (
                                <span className={`rounded-full px-2 py-1 text-xs font-bold ${rowMessage === 'Saved' || rowMessage === 'Uploaded' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                                  {rowMessage}
                                </span>
                              ) : dirty ? (
                                <StatusBadge tone="warning">Unsaved</StatusBadge>
                              ) : null}
                              {menu.image_view_url ? (
                                <a
                                  href={menu.image_view_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-xs font-black text-[#6f4e37] underline"
                                >
                                  เปิดรูปใน Drive
                                </a>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>

            {isLoading ? (
              <div className="grid gap-3 p-4">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="h-14 animate-pulse rounded-2xl bg-stone-100" />
                ))}
              </div>
            ) : null}

            {!isLoading && !filteredMenus.length ? (
              <div className="flex h-48 items-center justify-center bg-[#fffaf3] text-sm font-semibold text-stone-400">
                ไม่พบเมนู
              </div>
            ) : null}
          </div>
        </section>
    </AppShell>
  );
}
