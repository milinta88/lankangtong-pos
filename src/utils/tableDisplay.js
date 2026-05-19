export function getTableDisplayName(tableId, fallbackName = '') {
  const normalizedTableId = String(tableId || '').trim().toUpperCase();

  if (normalizedTableId === 'T10') {
    return 'ซุ้มน้ำ 1';
  }

  return fallbackName || tableId || '';
}
