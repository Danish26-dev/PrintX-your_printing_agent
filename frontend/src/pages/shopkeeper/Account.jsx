import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Settings, Pencil } from 'lucide-react';
import ShopkeeperLayout from '../../components/shopkeeper/ShopkeeperLayout';
import { getShopkeeper, logout } from '../../services/shopkeeperService';
import { getPrinterStatus } from '../../services/printerService';

const Account = () => {
  const navigate = useNavigate();
  const shopkeeper = getShopkeeper() || {};
  const [printer, setPrinter] = useState({ name: 'Checking…', real: false });

  useEffect(() => {
    let cancelled = false;
    getPrinterStatus().then((p) => {
      if (!cancelled) setPrinter(p);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/shopkeeper/login');
  };

  const fields = [
    { label: 'Shop Name', value: shopkeeper.shopName || 'PrintsX Lab' },
    { label: 'Shopkeeper Name', value: shopkeeper.shopkeeperName || '—' },
    { label: 'Email', value: shopkeeper.email || '—' },
    { label: 'Shop ID', value: shopkeeper.shopId || 'printx-lab' },
    { label: 'Printer', value: printer.real ? printer.name : `${printer.name} (agent offline)` },
  ];

  return (
    <ShopkeeperLayout title="Account" subtitle="Your shop profile">
      <div className="sk-card" style={{ maxWidth: 620 }}>
        <div className="sk-grid cols-2" style={{ gap: 20 }}>
          {fields.map((f) => (
            <div className="sk-field" key={f.label}>
              <label>{f.label}</label>
              <span className="value">{f.value}</span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 28, flexWrap: 'wrap' }}>
          <button className="sk-btn ghost" title="Profile editing is a demo for now">
            <Pencil size={16} /> Edit Profile
          </button>
          <button className="sk-btn ghost" title="Shop settings are a demo for now">
            <Settings size={16} /> Shop Settings
          </button>
          <button className="sk-btn primary" onClick={handleLogout}>
            <LogOut size={16} /> Logout
          </button>
        </div>
        <p style={{ fontSize: 12, color: '#6B7280', marginTop: 16 }}>
          Profile and shop settings editing are not yet connected to a backend (demo).
          Logout clears the current local session.
        </p>
      </div>
    </ShopkeeperLayout>
  );
};

export default Account;
