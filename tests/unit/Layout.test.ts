import { describe, it, expect } from 'vitest';
import { resolveOrientation, canvasSize } from '@/config/Layout';

describe('resolveOrientation', () => {
  it('uses portrait on touch-only devices', () => {
    expect(resolveOrientation({ coarsePointer: true, finePointer: false })).toBe('portrait');
  });
  it('uses landscape when a mouse is available', () => {
    expect(resolveOrientation({ coarsePointer: false, finePointer: true })).toBe('landscape');
  });
  it('uses landscape on touch laptops that also have a trackpad', () => {
    expect(resolveOrientation({ coarsePointer: true, finePointer: true })).toBe('landscape');
  });
  it('honours a portrait override', () => {
    expect(resolveOrientation({ coarsePointer: false, finePointer: true, override: 'portrait' })).toBe('portrait');
  });
  it('honours a landscape override', () => {
    expect(resolveOrientation({ coarsePointer: true, finePointer: false, override: 'landscape' })).toBe('landscape');
  });
  it('ignores an unknown override', () => {
    expect(resolveOrientation({ coarsePointer: true, finePointer: false, override: 'square' })).toBe('portrait');
  });
});

describe('canvasSize', () => {
  it('is 720x1280 in portrait', () => expect(canvasSize('portrait')).toEqual({ width: 720, height: 1280 }));
  it('is 1280x720 in landscape', () => expect(canvasSize('landscape')).toEqual({ width: 1280, height: 720 }));
});

describe('縦横の切り替え (#95)', () => {
  it('a phone plays the way it is held', () => {
    expect(resolveOrientation({ coarsePointer: true, finePointer: false, wide: true })).toBe('landscape');
    expect(resolveOrientation({ coarsePointer: true, finePointer: false, wide: false })).toBe('portrait');
  });
  it('a computer stays landscape however its window is shaped', () => {
    expect(resolveOrientation({ coarsePointer: false, finePointer: true, wide: false })).toBe('landscape');
  });
  it('the settings fix a way, the URL beats them', () => {
    expect(resolveOrientation({ coarsePointer: true, finePointer: false, wide: true, choice: 'portrait' })).toBe('portrait');
    expect(resolveOrientation({ coarsePointer: false, finePointer: true, choice: 'portrait' })).toBe('portrait');
    expect(resolveOrientation({ coarsePointer: false, finePointer: true, choice: 'portrait', override: 'landscape' })).toBe('landscape');
    expect(resolveOrientation({ coarsePointer: true, finePointer: false, wide: true, choice: 'auto' })).toBe('landscape');
  });
});
