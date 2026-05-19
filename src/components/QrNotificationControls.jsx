import React from 'react';
import { BellRing, Volume2 } from 'lucide-react';
import Button from './Button.jsx';
import {
  canUseBrowserNotifications,
  getBrowserNotificationPermission,
  playQrPendingBeep,
  requestBrowserNotificationPermission,
  showQrPendingTestNotification,
} from '../services/qrPendingAlerts.js';
import {
  readQrBrowserNotificationEnabled,
  readQrPendingSoundEnabled,
  writeQrBrowserNotificationEnabled,
  writeQrPendingSoundEnabled,
} from '../services/qrPendingState.js';

export default function QrNotificationControls() {
  const [soundEnabled, setSoundEnabled] = React.useState(readQrPendingSoundEnabled);
  const [browserNotificationEnabled, setBrowserNotificationEnabled] = React.useState(
    readQrBrowserNotificationEnabled,
  );
  const [permission, setPermission] = React.useState(getBrowserNotificationPermission);
  const [message, setMessage] = React.useState('');

  React.useEffect(() => {
    if (browserNotificationEnabled && permission !== 'granted') {
      setBrowserNotificationEnabled(false);
      writeQrBrowserNotificationEnabled(false);
    }
  }, [browserNotificationEnabled, permission]);

  const permissionLabel = {
    granted: 'อนุญาตแล้ว',
    default: 'ยังไม่ได้อนุญาต',
    denied: 'ถูกบล็อก',
    unsupported: 'ไม่รองรับ',
  }[permission] || 'ยังไม่ได้อนุญาต';

  const handleSoundToggle = (event) => {
    const isEnabled = event.target.checked;
    setSoundEnabled(isEnabled);
    writeQrPendingSoundEnabled(isEnabled);
    setMessage('');
  };

  const handleBrowserNotificationToggle = async () => {
    setMessage('');

    if (browserNotificationEnabled) {
      setBrowserNotificationEnabled(false);
      writeQrBrowserNotificationEnabled(false);
      return;
    }

    if (!canUseBrowserNotifications()) {
      setPermission('unsupported');
      setMessage('Browser ไม่รองรับการแจ้งเตือน');
      writeQrBrowserNotificationEnabled(false);
      return;
    }

    const nextPermission =
      getBrowserNotificationPermission() === 'granted'
        ? 'granted'
        : await requestBrowserNotificationPermission();

    setPermission(nextPermission);

    if (nextPermission !== 'granted') {
      setBrowserNotificationEnabled(false);
      writeQrBrowserNotificationEnabled(false);
      setMessage('Browser ไม่อนุญาตการแจ้งเตือน กรุณาเปิดสิทธิ์แจ้งเตือนใน Chrome/Edge settings');
      return;
    }

    setBrowserNotificationEnabled(true);
    writeQrBrowserNotificationEnabled(true);
    setMessage('เปิดแจ้งเตือนบน Browser แล้ว');
  };

  const handleTestSound = () => {
    playQrPendingBeep();
    setMessage('ทดสอบเสียงแล้ว');
  };

  const handleTestNotification = async () => {
    setMessage('');

    if (!canUseBrowserNotifications()) {
      setPermission('unsupported');
      setMessage('Browser ไม่รองรับการแจ้งเตือน');
      return;
    }

    const nextPermission =
      getBrowserNotificationPermission() === 'granted'
        ? 'granted'
        : await requestBrowserNotificationPermission();

    setPermission(nextPermission);

    if (nextPermission !== 'granted') {
      setBrowserNotificationEnabled(false);
      writeQrBrowserNotificationEnabled(false);
      setMessage('Browser ไม่อนุญาตการแจ้งเตือน กรุณาเปิดสิทธิ์แจ้งเตือนใน Chrome/Edge settings');
      return;
    }

    setBrowserNotificationEnabled(true);
    writeQrBrowserNotificationEnabled(true);
    showQrPendingTestNotification();

    if (soundEnabled) {
      playQrPendingBeep();
    }

    setMessage('ส่งทดสอบแจ้งเตือนแล้ว');
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs font-black text-amber-950 shadow-sm">
      <span className="inline-flex items-center gap-1.5">
        <BellRing size={15} />
        แจ้งเตือน QR
      </span>
      <label className="inline-flex items-center gap-1.5 rounded-xl bg-white/80 px-2 py-1">
        <input
          type="checkbox"
          checked={soundEnabled}
          onChange={handleSoundToggle}
          className="h-4 w-4 accent-amber-600"
        />
        <Volume2 size={14} />
        เปิดเสียงแจ้งเตือน
      </label>
      <Button size="sm" variant={browserNotificationEnabled ? 'success' : 'subtle'} onClick={handleBrowserNotificationToggle}>
        {browserNotificationEnabled ? 'Browser เปิดอยู่' : 'เปิดแจ้งเตือนบน Browser'}
      </Button>
      <Button size="sm" variant="ghost" onClick={handleTestSound}>
        ทดสอบเสียง
      </Button>
      <Button size="sm" variant="ghost" onClick={handleTestNotification}>
        ทดสอบแจ้งเตือน
      </Button>
      <span className={permission === 'denied' ? 'text-rose-700' : 'text-amber-800'}>
        {permissionLabel}
      </span>
      {message ? (
        <span className={permission === 'denied' ? 'text-rose-700' : 'text-amber-800'}>{message}</span>
      ) : null}
      <span className="basis-full text-[11px] font-bold leading-snug text-amber-800/80">
        แจ้งเตือนจะทำงานเมื่อเปิดเว็บแอพค้างไว้ แม้พับหน้าต่างหรืออยู่แท็บอื่น แต่ถ้าปิด Browser/Tab แล้วจะไม่แจ้งเตือน
      </span>
    </div>
  );
}
