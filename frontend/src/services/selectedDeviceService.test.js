// Tests for the single-source-of-truth selected-device service (persistence +
// subscription). jsdom provides localStorage.
import {
  getSelectedDevice,
  setSelectedDevice,
  clearSelectedDevice,
  subscribeSelectedDevice,
  hasSelectedDevice,
} from './selectedDeviceService';

afterEach(() => {
  clearSelectedDevice();
});

test('starts with no selection', () => {
  expect(getSelectedDevice()).toBeNull();
  expect(hasSelectedDevice()).toBe(false);
});

test('persists a demo selection and reads it back (survives a reload)', () => {
  const device = { id: 'demo-printer', name: 'PrintX Demo Printer', mode: 'demo', status: 'online' };
  setSelectedDevice(device);
  expect(hasSelectedDevice()).toBe(true);
  expect(getSelectedDevice()).toEqual(device);
  // Simulate a fresh module read (localStorage is the source of truth).
  expect(JSON.parse(localStorage.getItem('printx.selectedDevice'))).toEqual(device);
});

test('persists a real selection with capabilities', () => {
  const device = {
    id: 'HP-LaserJet', name: 'HP LaserJet', mode: 'real', status: 'online',
    capabilities: { supportsColor: false, supportsDuplex: true, paperSizes: ['A4', 'Letter'] },
  };
  setSelectedDevice(device);
  expect(getSelectedDevice().mode).toBe('real');
  expect(getSelectedDevice().capabilities.supportsDuplex).toBe(true);
});

test('clear removes the selection', () => {
  setSelectedDevice({ id: 'demo-printer', name: 'Demo', mode: 'demo' });
  clearSelectedDevice();
  expect(getSelectedDevice()).toBeNull();
  expect(hasSelectedDevice()).toBe(false);
});

test('subscribers are notified on change and on clear', () => {
  const seen = [];
  const unsub = subscribeSelectedDevice((d) => seen.push(d));
  setSelectedDevice({ id: 'demo-printer', name: 'Demo', mode: 'demo' });
  setSelectedDevice({ id: 'HP', name: 'HP', mode: 'real' });
  clearSelectedDevice();
  unsub();
  setSelectedDevice({ id: 'ignored', name: 'x', mode: 'demo' }); // after unsub -> not seen
  expect(seen.map((d) => (d ? d.mode : null))).toEqual(['demo', 'real', null]);
});
