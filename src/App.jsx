import React from 'react';
import POS from './pages/POS.jsx';
import Receipt from './pages/Receipt.jsx';
import CustomerOrder from './pages/CustomerOrder.jsx';
import Kitchen from './pages/Kitchen.jsx';
import Stock from './pages/Stock.jsx';
import Admin from './pages/Admin.jsx';
import Report from './pages/Report.jsx';
import Tables from './pages/Tables.jsx';
import TableQr from './pages/TableQr.jsx';
import QrPendingGlobalWatcher from './components/QrPendingGlobalWatcher.jsx';
import { getCurrentRoutePath, navigateTo } from './services/router.js';

const routes = {
  '/pos': POS,
  '/order': CustomerOrder,
  '/kitchen': Kitchen,
  '/tables': Tables,
  '/table-qr': TableQr,
  '/stock': Stock,
  '/admin': Admin,
  '/report': Report,
};

function getRoute() {
  const path = getCurrentRoutePath();

  if (path.startsWith('/receipt/')) {
    return {
      Component: Receipt,
      params: {
        orderId: decodeURIComponent(path.replace('/receipt/', '')),
      },
    };
  }

  return {
    Component: routes[path] || POS,
    params: {},
  };
}

export { navigateTo };

export default function App() {
  const [{ Component, params }, setRoute] = React.useState(getRoute);

  React.useEffect(() => {
    const handleRoute = () => setRoute(getRoute());

    window.addEventListener('popstate', handleRoute);
    window.addEventListener('hashchange', handleRoute);
    return () => {
      window.removeEventListener('popstate', handleRoute);
      window.removeEventListener('hashchange', handleRoute);
    };
  }, []);

  return (
    <>
      <QrPendingGlobalWatcher />
      <Component {...params} />
    </>
  );
}
