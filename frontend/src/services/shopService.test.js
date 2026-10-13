// Verifies the single-shop MVP requirement: PrintX Lab is the only shop and no
// fabricated rating/distance/availability fields are present.
import { getShops, getShopById, shops, PRINTX_LAB } from './shopService';

test('there is exactly one shop: PrintX Lab', async () => {
  expect(shops).toHaveLength(1);
  const list = await getShops();
  expect(list).toHaveLength(1);
  expect(list[0].id).toBe('printx-lab');
  expect(list[0].name).toBe('PrintX Lab');
  expect(list[0].isPrintX).toBe(true);
});

test('does not expose fabricated rating/distance/availability fields', () => {
  expect(PRINTX_LAB.rating).toBeUndefined();
  expect(PRINTX_LAB.location).toBeUndefined();
  expect(PRINTX_LAB.status).toBeUndefined();
});

test('getShopById resolves PrintX Lab and nothing else', async () => {
  expect((await getShopById('printx-lab'))?.name).toBe('PrintX Lab');
  expect(await getShopById('some-other-shop')).toBeNull();
});

test('search still returns PrintX Lab by name, empty for non-match', async () => {
  expect(await getShops('printx')).toHaveLength(1);
  expect(await getShops('zzz-no-such-shop')).toHaveLength(0);
});
