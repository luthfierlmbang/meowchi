/**
 * DOM test for Mandatory Rule Req 14.1: every cat sprite uses the `pixel-img`
 * utility class so the user agent applies `image-rendering: pixelated;
 * image-rendering: crisp-edges;` to the rendered <img>.
 *
 * jsdom does not load `tailwind.css` (no Vite pipeline in unit tests), so
 * `getComputedStyle(img).imageRendering` returns "" regardless of class.
 * The robust assertion across all environments is the class itself; the
 * actual style application is owned by the CSS layer (`tailwind.css` /
 * `styles.css` fallback) and verified by manual QA in the dev build.
 *
 * **Validates: Requirements 14.1**
 */
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Sprite_Renderer } from './Sprite_Renderer';
import type { CatState } from '../state/types';

const STATES: CatState[] = [
  'idle',
  'walking_left',
  'walking_right',
  'carried',
  'scratching',
  'eating',
  'pooping',
  'sleeping',
];

describe('Mandatory Rule 14.1: pixel-img class on every cat sprite', () => {
  for (const s of STATES) {
    it(`applies "pixel-img" class to <img> when currentState is ${s}`, () => {
      const { container } = render(
        <Sprite_Renderer currentState={s} energy={50} position={{ x: 0, y: 0 }} />,
      );
      const img = container.querySelector('img');
      expect(img).not.toBeNull();
      expect(img!.classList.contains('pixel-img')).toBe(true);
    });
  }

  it('applies pixel-img to carried sprite when energy ≤ 40 (lift_sleepy variant)', () => {
    const { container } = render(
      <Sprite_Renderer currentState="carried" energy={20} position={{ x: 0, y: 0 }} />,
    );
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img!.classList.contains('pixel-img')).toBe(true);
  });

  it('walking_left applies transform: scaleX(-1) (Req 7.3 mirror via CSS)', () => {
    const { container } = render(
      <Sprite_Renderer currentState="walking_left" energy={50} position={{ x: 0, y: 0 }} />,
    );
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img!.style.transform).toContain('scaleX(-1)');
  });

  it('walking_right does NOT apply scaleX(-1)', () => {
    const { container } = render(
      <Sprite_Renderer currentState="walking_right" energy={50} position={{ x: 0, y: 0 }} />,
    );
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img!.style.transform || '').not.toContain('scaleX(-1)');
  });
});
