import { canViewTransition, vtName, withViewTransition } from './motion';

function mockReducedMotion(reduce: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reduce && query.includes('reduce'),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
}

describe('withViewTransition', () => {
  const original = document.startViewTransition;
  const originalMatchMedia = window.matchMedia;
  afterEach(() => {
    document.startViewTransition = original;
    window.matchMedia = originalMatchMedia;
  });

  it('sin soporte del navegador aplica el cambio directo', async () => {
    mockReducedMotion(false);
    // jsdom no implementa View Transitions
    document.startViewTransition = undefined as unknown as typeof document.startViewTransition;
    const update = vi.fn();
    await withViewTransition(update);
    expect(update).toHaveBeenCalledOnce();
    expect(canViewTransition()).toBe(false);
  });

  it('usa la transición cuando existe y no hay reduced motion', async () => {
    mockReducedMotion(false);
    const start = vi.fn((cb: () => void) => {
      cb();
      return { finished: Promise.resolve() };
    });
    document.startViewTransition = start as unknown as typeof document.startViewTransition;
    const update = vi.fn();
    await withViewTransition(update);
    expect(start).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledOnce();
  });

  it('con reduced motion no anima', async () => {
    mockReducedMotion(true);
    const start = vi.fn();
    document.startViewTransition = start as unknown as typeof document.startViewTransition;
    const update = vi.fn();
    await withViewTransition(update);
    expect(start).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledOnce();
  });

  it('vtName genera nombres válidos', () => {
    expect(vtName('order', 'DEMO-1043')).toBe('order-demo-1043');
    expect(vtName('order', 'A B/1')).toBe('order-a-b-1');
  });
});
