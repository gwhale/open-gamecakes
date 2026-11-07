import { describe, expect, it } from 'vitest';
import {
  FROSTING_COLORS,
  PAINT_COLORS,
  PLAIN_CUPCAKE,
  UNLOCK_CATALOG_TOTAL_COST,
  WRAPPER_COLORS,
  UNLOCK_CATALOG,
  coerceCupcakeConfig,
  isFreeCupcakeOption,
  isValidCupcakeConfig,
  frostingColors,
  parseCupcakeConfigInput,
  wrapperColors,
} from './config';

// A row saved before hats, glasses and faces existed.
const LEGACY = { base: 'cakepop', wrapper: 'mint', frosting: 'pink', topping: 'cherry', variety: 'tall' };

describe('cupcake config: hats, glasses, faces, colours', () => {
  it('the plain default is valid and wears nothing', () => {
    expect(isValidCupcakeConfig(PLAIN_CUPCAKE)).toBe(true);
    expect(PLAIN_CUPCAKE.hat).toBe('none');
    expect(PLAIN_CUPCAKE.glasses).toBe('none');
    expect(PLAIN_CUPCAKE.face).toBe('none');
  });

  it('a legacy five-field row is not a full config, but coerces with defaults', () => {
    expect(isValidCupcakeConfig(LEGACY)).toBe(false);
    expect(coerceCupcakeConfig(LEGACY)).toEqual({
      ...LEGACY,
      hat: 'none',
      glasses: 'none',
      face: 'none',
      hatColor: PLAIN_CUPCAKE.hatColor,
      glassesColor: PLAIN_CUPCAKE.glassesColor,
      frostingColor: 'none',
      wrapperColor: 'none',
    });
  });

  it('coercion keeps valid new fields and drops bad ones', () => {
    const c = coerceCupcakeConfig({ ...LEGACY, hat: 'crown', glasses: 'monocle', hatColor: '#ff0000' });
    expect(c.hat).toBe('crown');
    expect(c.glasses).toBe('none');
    expect(c.hatColor).toBe(PLAIN_CUPCAKE.hatColor);
  });

  it('only palette keys are valid colours, never raw hex', () => {
    expect(isValidCupcakeConfig({ ...PLAIN_CUPCAKE, hatColor: 'grape' })).toBe(true);
    expect(isValidCupcakeConfig({ ...PLAIN_CUPCAKE, hatColor: '#a855f7' })).toBe(false);
    expect(isValidCupcakeConfig({ ...PLAIN_CUPCAKE, glassesColor: 'gold' })).toBe(false);
  });
});

describe('parseCupcakeConfigInput (apply route body)', () => {
  it('fills omitted new fields from an older client with defaults', () => {
    expect(parseCupcakeConfigInput(LEGACY)).toEqual(coerceCupcakeConfig(LEGACY));
  });

  it('rejects a present-but-invalid new field', () => {
    expect(parseCupcakeConfigInput({ ...LEGACY, hat: 'helmet' })).toBeNull();
    expect(parseCupcakeConfigInput({ ...LEGACY, glassesColor: 42 })).toBeNull();
  });

  it('still requires the original five fields', () => {
    expect(parseCupcakeConfigInput({ ...LEGACY, topping: undefined })).toBeNull();
    expect(parseCupcakeConfigInput(null)).toBeNull();
  });

  it('passes a full valid config through unchanged', () => {
    const full = { ...PLAIN_CUPCAKE, hat: 'wizard', glasses: 'star', face: 'wink', hatColor: 'sky' };
    expect(parseCupcakeConfigInput(full)).toEqual(full);
  });
});

describe('what is free and what costs tokens', () => {
  it('defaults and a smile are free; hat and glasses colours never need an unlock', () => {
    expect(isFreeCupcakeOption('hat', 'none')).toBe(true);
    expect(isFreeCupcakeOption('face', 'none')).toBe(true);
    expect(isFreeCupcakeOption('face', 'smile')).toBe(true);
    expect(isFreeCupcakeOption('hat', 'crown')).toBe(false);
    expect(isFreeCupcakeOption('face', 'grin')).toBe(false);
  });

  it('every non-free hat, glasses and face is in the catalog at a cosmetic price', () => {
    const options = {
      hat: ['party', 'beanie', 'tophat', 'wizard', 'crown'],
      glasses: ['round', 'sunnies', 'heart', 'star'],
      face: ['grin', 'wink', 'sleepy', 'silly'],
    } as const;
    for (const [kind, values] of Object.entries(options)) {
      for (const value of values) {
        const item = UNLOCK_CATALOG.find((c) => c.kind === kind && c.value === value);
        expect(item, `${kind}:${value}`).toBeDefined();
        // Cosmetics sit at 4–40 on the economy ladder (src/lib/tokens/economy.ts).
        expect(item!.cost).toBeGreaterThanOrEqual(4);
        expect(item!.cost).toBeLessThanOrEqual(40);
      }
    }
    expect(UNLOCK_CATALOG.some((c) => c.kind === 'face' && c.value === 'smile')).toBe(false);
  });
});

describe('bought frosting and wrapper colours', () => {
  it('the original colour is free and every palette colour is for sale', () => {
    expect(isFreeCupcakeOption('frostingColor', 'none')).toBe(true);
    expect(isFreeCupcakeOption('wrapperColor', 'none')).toBe(true);
    expect(isFreeCupcakeOption('frostingColor', 'grape')).toBe(false);
    for (const kind of ['frostingColor', 'wrapperColor'] as const) {
      const colours = UNLOCK_CATALOG.filter((c) => c.kind === kind).map((c) => c.value);
      expect(colours.sort()).toEqual(Object.keys(PAINT_COLORS).sort());
    }
    expect(UNLOCK_CATALOG_TOTAL_COST).toBe(525);
  });

  it('a bought colour paints over the named frosting / wrapper, and none keeps it', () => {
    const pink = { ...PLAIN_CUPCAKE, frosting: 'pink', wrapper: 'mint' } as const;
    expect(frostingColors(pink)).toBe(FROSTING_COLORS.pink);
    expect(wrapperColors(pink)).toBe(WRAPPER_COLORS.mint);
    const grape = { ...pink, frostingColor: 'grape', wrapperColor: 'ocean' } as const;
    expect(frostingColors(grape).fill).toBe(PAINT_COLORS.grape.hex);
    expect(wrapperColors(grape).paper).toBe(PAINT_COLORS.ocean.hex);
    expect(frostingColors(grape).highlight).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('an older client that omits them gets none; a bad value is rejected', () => {
    const parsed = parseCupcakeConfigInput(LEGACY);
    expect(parsed?.frostingColor).toBe('none');
    expect(parsed?.wrapperColor).toBe('none');
    expect(parseCupcakeConfigInput({ ...PLAIN_CUPCAKE, frostingColor: 'gold' })).toBeNull();
  });
});
