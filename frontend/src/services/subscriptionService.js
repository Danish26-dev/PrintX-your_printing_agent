// Subscription plans + usage.
//
// DEMO DATA. No real billing/payment is implemented. Structured so a real
// billing provider (Stripe/Razorpay/etc.) can replace it later. Do NOT present
// any payment action as functional until a real integration exists.

export function getCurrentPlan() {
  return {
    name: 'PrintsX Pro',
    price: '₹999',
    interval: 'month',
    features: [
      'AI document processing',
      'Agent-assisted printing',
      'Unlimited customer requests',
      'Printer automation',
      'Shopkeeper dashboard',
    ],
  };
}

export function getUsage() {
  return [
    { label: 'Print Jobs', used: 128, limit: 500 },
    { label: 'AI Operations', used: 342, limit: 1000 },
  ];
}

export function getPlans() {
  return [
    {
      id: 'free',
      name: 'Free',
      price: '₹0',
      interval: 'month',
      features: ['50 print jobs / month', 'Basic AI editing', 'Single printer'],
      current: false,
    },
    {
      id: 'basic',
      name: 'Basic',
      price: '₹499',
      interval: 'month',
      features: ['200 print jobs / month', 'AI editing', 'Printer automation', 'Email support'],
      current: false,
    },
    {
      id: 'pro',
      name: 'Pro',
      price: '₹999',
      interval: 'month',
      features: [
        'Unlimited customer requests',
        'Agent-assisted printing',
        'Priority support',
        'Shopkeeper dashboard',
      ],
      current: true,
    },
  ];
}
