import React from 'react';
import { BellRing, Volume2 } from 'lucide-react';
import Button from './Button.jsx';
import {
  canUseBrowserNotifications,
  getBrowserNotificationPermission,
  playQrPendingBeep,
  requestBrowserNotificationPermission,
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
      setMessage('Browser ไม่อนุญาตการแจ้งเตือน');
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
      {message ? (
        <span className={permission === 'denied' ? 'text-rose-700' : 'text-amber-800'}>{message}</span>
      ) : null}
    </div>
  );
}
