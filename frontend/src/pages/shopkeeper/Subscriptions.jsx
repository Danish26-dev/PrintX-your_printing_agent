import React from 'react';
import { Check } from 'lucide-react';
import ShopkeeperLayout from '../../components/shopkeeper/ShopkeeperLayout';
import { getCurrentPlan, getUsage, getPlans } from '../../services/subscriptionService';

const Subscriptions = () => {
  const plan = getCurrentPlan();
  const usage = getUsage();
  const plans = getPlans();

  return (
    <ShopkeeperLayout title="Subscriptions" subtitle="Manage your PrintsX plan">
      {/* Current plan + usage */}
      <div className="sk-grid cols-2">
        <div className="sk-card">
          <p className="sk-section-label">Current Plan</p>
          <h3 style={{ fontSize: 24, margin: '0 0 4px 0' }}>{plan.name}</h3>
          <div style={{ fontSize: 28, fontWeight: 800 }}>
            {plan.price} <span style={{ fontSize: 14, color: '#9CA3AF', fontWeight: 500 }}>/ {plan.interval}</span>
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: '18px 0 0 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {plan.features.map((f) => (
              <li key={f} style={{ fontSize: 14, display: 'flex', gap: 8 }}>
                <Check size={16} color="#22C55E" /> {f}
              </li>
            ))}
          </ul>
        </div>

        <div className="sk-card">
          <p className="sk-section-label">Usage this cycle</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginTop: 8 }}>
            {usage.map((u) => (
              <div key={u.label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                  <span>{u.label}</span>
                  <span style={{ color: '#9CA3AF' }}>{u.used} / {u.limit}</span>
                </div>
                <div className="sk-usage-bar">
                  <div className="sk-usage-fill" style={{ width: `${Math.min(100, (u.used / u.limit) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Available plans */}
      <div>
        <p className="sk-section-label">Available Plans</p>
        <div className="sk-plan-cards">
          {plans.map((p) => (
            <div key={p.id} className={`sk-plan ${p.current ? 'current' : ''}`}>
              <h3>{p.name}</h3>
              <div className="price">{p.price} <span>/ {p.interval}</span></div>
              <ul>
                {p.features.map((f) => (
                  <li key={f}><Check size={15} color="#22C55E" /> {f}</li>
                ))}
              </ul>
              <button className={`sk-btn ${p.current ? 'ghost' : 'primary'}`} disabled={p.current} title={p.current ? 'Current plan' : 'Payments not yet available'}>
                {p.current ? 'Current Plan' : 'Choose Plan'}
              </button>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 12, color: '#6B7280', marginTop: 12 }}>
          Billing is not yet connected — plan selection is a demo. Payment integration will be added later.
        </p>
      </div>
    </ShopkeeperLayout>
  );
};

export default Subscriptions;
