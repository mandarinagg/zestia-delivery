import {
  SESSION_DEADLINES_KEY,
  SESSION_GENERATION_KEY,
  sessionGeneration,
  clearSessionDeadlines,
  getSessionDeadlines,
  recordSessionHeaders,
  recordSessionRemaining,
  subscribeSessionDeadlines,
} from './session-clock';

const stored = (idle: number, absolute: number, gen = sessionGeneration()) =>
  JSON.stringify({ idle, absolute, gen });

describe('vencimientos de la sesión', () => {
  it('convierte los segundos restantes en instantes de este reloj', () => {
    recordSessionRemaining(1800, 43200, 1_000_000);
    expect(getSessionDeadlines()).toEqual({ idle: 2_800_000, absolute: 44_200_000 });
  });

  it('se queda con el más tardío de cada uno (una respuesta lenta llega vieja)', () => {
    recordSessionRemaining(1800, 43200, 1_000_000);
    recordSessionRemaining(100, 100, 1_000_500);
    expect(getSessionDeadlines()).toEqual({ idle: 2_800_000, absolute: 44_200_000 });
    recordSessionRemaining(1800, 43200, 1_060_000);
    expect(getSessionDeadlines()?.idle).toBe(2_860_000);
  });

  it('lee los headers de la API y ignora los incompletos o inválidos', () => {
    recordSessionHeaders(new Headers({ 'X-Session-Idle-Remaining': '60' }));
    expect(getSessionDeadlines()).toBeNull();
    recordSessionHeaders(
      new Headers({ 'X-Session-Idle-Remaining': 'abc', 'X-Session-Absolute-Remaining': '60' }),
    );
    expect(getSessionDeadlines()).toBeNull();
    recordSessionHeaders(
      new Headers({ 'X-Session-Idle-Remaining': '60', 'X-Session-Absolute-Remaining': '90' }),
    );
    const d = getSessionDeadlines()!;
    expect(d.absolute - d.idle).toBe(30_000);
  });

  it('se comparte por localStorage y avisa a quien escucha', () => {
    const listener = vi.fn();
    const off = subscribeSessionDeadlines(listener);
    recordSessionRemaining(60, 120, 5_000);
    expect(JSON.parse(window.localStorage.getItem(SESSION_DEADLINES_KEY)!)).toEqual({
      idle: 65_000,
      absolute: 125_000,
      gen: sessionGeneration(),
    });
    expect(listener).toHaveBeenCalledTimes(1);
    recordSessionRemaining(60, 120, 5_000); // igual: sin cambios, sin aviso
    expect(listener).toHaveBeenCalledTimes(1);
    off();
  });

  it('el evento storage de otra pestaña suma el más tardío; si borró la clave, la sesión terminó', () => {
    recordSessionRemaining(60, 600, 0);
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: SESSION_DEADLINES_KEY,
        newValue: stored(300_000, 100_000),
      }),
    );
    expect(getSessionDeadlines()).toEqual({ idle: 300_000, absolute: 600_000 });

    window.dispatchEvent(
      new StorageEvent('storage', { key: SESSION_DEADLINES_KEY, newValue: null }),
    );
    expect(getSessionDeadlines()).toBeNull();
  });

  it('ignora otras claves y valores corruptos al leerlos', () => {
    recordSessionRemaining(60, 600, 0);
    window.dispatchEvent(new StorageEvent('storage', { key: 'otra.cosa', newValue: null }));
    expect(getSessionDeadlines()).not.toBeNull();
    window.dispatchEvent(
      new StorageEvent('storage', { key: SESSION_DEADLINES_KEY, newValue: '{no es json' }),
    );
    expect(getSessionDeadlines()).toBeNull();
  });

  it('clearSessionDeadlines la olvida y borra lo compartido', () => {
    recordSessionRemaining(60, 600, 0);
    clearSessionDeadlines();
    expect(getSessionDeadlines()).toBeNull();
    expect(window.localStorage.getItem(SESSION_DEADLINES_KEY)).toBeNull();
  });

  describe('generación de la sesión', () => {
    it('sube con cada logout, 401 o login (clear) y se comparte por localStorage', () => {
      const before = sessionGeneration();
      clearSessionDeadlines();
      expect(sessionGeneration()).toBe(before + 1);
      expect(window.localStorage.getItem(SESSION_GENERATION_KEY)).toBe(String(before + 1));
    });

    it('una respuesta de una generación anterior no revive los vencimientos', () => {
      const started = sessionGeneration(); // el pedido sale
      clearSessionDeadlines(); // logout (o login de otra persona) mientras vuela
      recordSessionRemaining(1800, 43200, Date.now(), started);
      expect(getSessionDeadlines()).toBeNull();
      recordSessionHeaders(
        new Headers({ 'X-Session-Idle-Remaining': '60', 'X-Session-Absolute-Remaining': '90' }),
        started,
      );
      expect(getSessionDeadlines()).toBeNull();
      // Un pedido de la generación vigente sí cuenta.
      recordSessionRemaining(60, 90, Date.now(), sessionGeneration());
      expect(getSessionDeadlines()).not.toBeNull();
    });

    it('si otra pestaña cierra o abre una sesión, lo de esta también se descarta', () => {
      recordSessionRemaining(60, 600, 0);
      const started = sessionGeneration();
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: SESSION_GENERATION_KEY,
          newValue: String(started + 1),
        }),
      );
      expect(sessionGeneration()).toBe(started + 1);
      expect(getSessionDeadlines()).toBeNull();
      recordSessionRemaining(60, 600, 0, started); // pedido viejo de esta pestaña
      expect(getSessionDeadlines()).toBeNull();
    });

    it('ignora lo que llega de otra pestaña con una generación anterior', () => {
      clearSessionDeadlines();
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: SESSION_DEADLINES_KEY,
          newValue: stored(900_000, 900_000, sessionGeneration() - 1),
        }),
      );
      expect(getSessionDeadlines()).toBeNull();
    });
  });
});
