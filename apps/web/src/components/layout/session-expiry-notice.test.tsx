import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetToasts } from '@/components/ui/toast';
import { formatTime } from '@/lib/format';
import { SESSION_DEADLINES_KEY, sessionGeneration } from '@/lib/session-clock';
import { fakeApi } from '@/test/fake-api';
import { renderApp } from '@/test/render-app';
import { SESSION_WARNING_MS, formatCountdown } from './session-expiry-notice';

/*
 * Reloj falso con `shouldAdvanceTime`: avanza solo con el tiempo real (así `findBy…` sigue
 * andando) y `advance()` lo adelanta de golpe. La API falsa lleva el reloj de la sesión como el
 * servidor (vence, renueva con la actividad, `session-status` no renueva): los vencimientos
 * salen de lo que ella informa en los headers.
 */
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => {
  resetToasts();
  vi.useRealTimers();
});

/**
 * Adelanta el reloj. Tramos cortos de 1 s, cada uno dentro de su `act`: así React corre sus
 * efectos entre un timer y el siguiente, como en el navegador (en un solo `act` largo, los
 * timers programados por un efecto no se reprograman hasta el final). Los saltos largos
 * (minutos sin nada en el medio) van de una.
 */
async function advance(ms: number) {
  const step = ms > 5 * 60_000 ? ms : 1_000;
  for (let left = ms; left > 0; left -= step) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(Math.min(step, left));
    });
  }
}

const count = (path: string) =>
  fakeApi.requests.filter((r) => r.path === `/api/v1/auth/${path}`).length;

async function openPanel() {
  const view = renderApp('/panel/');
  // `hidden`: con el aviso abierto el resto de la página queda inerte para los lectores.
  await screen.findByRole('button', { name: 'Menú de usuario', hidden: true });
  return view;
}

const warning = () => screen.queryByRole('alertdialog');
const WARNING_S = SESSION_WARNING_MS / 1000;

/**
 * Abre el panel (sesión de 30 min) y deja pasar el tiempo hasta `secondsBefore` segundos antes
 * del aviso: como en la vida real, sin pedidos mientras tanto.
 */
async function panelNearWarning(secondsBefore: number) {
  const view = await openPanel();
  await advance((fakeApi.idleTimeoutSeconds - WARNING_S - secondsBefore) * 1000);
  return view;
}

describe('cuenta regresiva', () => {
  it('mm:ss, redondeando hacia arriba y sin negativos', () => {
    expect(formatCountdown(120_000)).toBe('02:00');
    expect(formatCountdown(119_001)).toBe('02:00');
    expect(formatCountdown(65_000)).toBe('01:05');
    expect(formatCountdown(999)).toBe('00:01');
    expect(formatCountdown(0)).toBe('00:00');
    expect(formatCountdown(-5_000)).toBe('00:00');
  });
});

describe('aviso por inactividad', () => {
  it('aparece 2 minutos antes, dice el tiempo en palabras y deja el foco en "Seguir conectado"', async () => {
    await panelNearWarning(60);
    expect(warning()).not.toBeInTheDocument();

    await advance(59_000);
    expect(warning()).not.toBeInTheDocument();

    await advance(2_000);
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Tu sesión va a cerrarse por inactividad',
    });
    // Para quien no ve el contador: el tiempo está en la descripción, que se lee al abrir.
    expect(dialog).toHaveAccessibleDescription(/en\s+menos de 2 minutos/);
    expect(screen.getByRole('timer')).toHaveTextContent(/^02:0\d$|^01:5\d$/);
    expect(screen.getByRole('button', { name: 'Seguir conectado' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();
  });

  it('la cuenta baja cada segundo, sin anunciarse (role timer, aria-live off)', async () => {
    await panelNearWarning(-1);
    await screen.findByRole('alertdialog');
    const timer = screen.getByRole('timer');
    expect(timer).toHaveAttribute('aria-live', 'off');
    await advance(61_000);
    expect(timer).toHaveTextContent(/^00:5\d$|^01:0\d$/);
    // El aviso se lee al abrir (descripción del diálogo); dentro no hay otra región viva.
    expect(within(screen.getByRole('alertdialog')).queryByRole('status')).not.toBeInTheDocument();
  });

  it('"Seguir conectado" renueva con GET /auth/me (no con session-status) y cierra el aviso', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await panelNearWarning(-1);
    await screen.findByRole('alertdialog');
    const me = count('me');

    await user.click(screen.getByRole('button', { name: 'Seguir conectado' }));

    await vi.waitFor(() => expect(warning()).not.toBeInTheDocument());
    expect(count('me')).toBe(me + 1);
    expect(count('session-status')).toBe(0);
    // Renovó de verdad: vuelve a avisar 28 minutos después, no antes.
    await advance(27 * 60_000);
    expect(warning()).not.toBeInTheDocument();
    await advance(2 * 60_000);
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
  });

  it('"Cerrar sesión" usa el logout normal y vuelve al ingreso', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { router } = await panelNearWarning(-1);
    await screen.findByRole('alertdialog');

    await user.click(screen.getByRole('button', { name: 'Cerrar sesión' }));

    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/ingreso'));
    expect(fakeApi.requests.some((r) => r.path === '/api/v1/auth/logout')).toBe(true);
    expect(fakeApi.session).toBeNull();
  });

  it('no se cierra con Escape (hay que elegir)', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await panelNearWarning(-1);
    await screen.findByRole('alertdialog');
    await user.keyboard('{Escape}');
    expect(warning()).toBeInTheDocument();
  });

  it('no pregunta nada al servidor antes de llegar a cero (sin polling)', async () => {
    await panelNearWarning(-1);
    await screen.findByRole('alertdialog');
    const before = [count('me'), count('session-status')];
    await advance(100_000);
    expect([count('me'), count('session-status')]).toEqual(before);
  });
});

describe('al llegar a cero (pregunta con session-status, que no renueva)', () => {
  it('401: limpia la sesión y va al ingreso con el motivo, anunciado', async () => {
    const { router } = await panelNearWarning(-1);
    await screen.findByRole('alertdialog');
    const me = count('me');

    await advance(121_000);

    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/ingreso'));
    expect(count('session-status')).toBe(1);
    expect(count('me')).toBe(me); // el chequeo nunca renueva
    expect(router.state.location.search).toMatchObject({ reason: 'idle' });
    const message = await screen.findByText(/Tu sesión se cerró por inactividad/);
    // Se anuncia: el aviso toma el foco al aparecer.
    expect(message.closest('[role=status]')).toHaveFocus();
    expect(warning()).not.toBeInTheDocument();
  });

  it('la pestaña renovó en otro lado: session-status trae un vencimiento mayor y el aviso se cierra', async () => {
    const { router } = await panelNearWarning(-1);
    await screen.findByRole('alertdialog');

    fakeApi.renewElsewhere(); // otra pestaña usó la sesión; esta todavía no lo sabe
    await advance(121_000);

    await vi.waitFor(() => expect(warning()).not.toBeInTheDocument());
    expect(count('session-status')).toBe(1);
    expect(router.state.location.pathname).toBe('/panel/');
    expect(fakeApi.session).not.toBeNull();
    // El aviso nuevo cuenta desde la renovación de la otra pestaña (hace ~2 min), no desde ahora.
    await advance(20 * 60_000);
    expect(warning()).not.toBeInTheDocument();
    await advance(8 * 60_000);
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
  });

  it('session-status trae el mismo vencimiento (quedaban fracciones): vuelve a preguntar y termina en 401', async () => {
    fakeApi.expiryGraceMs = 1500; // el servidor todavía la da por válida un instante después
    const { router } = await panelNearWarning(-1);
    await screen.findByRole('alertdialog');

    await advance(121_000); // llega a cero: 200, sin vencimiento nuevo
    expect(count('session-status')).toBe(1);
    expect(router.state.location.pathname).toBe('/panel/');

    await advance(4_000); // restante + 2 s: pregunta de nuevo y ahora sí venció
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/ingreso'));
    expect(count('session-status')).toBe(2);
    expect(count('me')).toBe(1); // solo la carga del panel
  });
});

describe('varias pestañas', () => {
  const stored = (idle: number, absolute: number) =>
    JSON.stringify({ idle, absolute, gen: sessionGeneration() });

  it('si otra pestaña renueva mientras el aviso está abierto, se cierra solo, sin preguntar', async () => {
    await panelNearWarning(-1);
    await screen.findByRole('alertdialog');
    const asked = [count('me'), count('session-status')];

    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: SESSION_DEADLINES_KEY,
          newValue: stored(Date.now() + 30 * 60_000, Date.now() + 12 * 3600_000),
        }),
      );
    });

    await vi.waitFor(() => expect(warning()).not.toBeInTheDocument());
    expect([count('me'), count('session-status')]).toEqual(asked);
  });

  it('un vencimiento más viejo de otra pestaña no adelanta el aviso', async () => {
    await openPanel();
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: SESSION_DEADLINES_KEY,
          newValue: stored(Date.now() + 1_000, Date.now() + 1_000),
        }),
      );
    });
    await advance(10_000);
    expect(warning()).not.toBeInTheDocument();
  });
});

describe('aviso del tiempo máximo de la sesión', () => {
  /** Panel abierto con `seconds` de tiempo máximo (la inactividad queda más lejos). */
  async function panelWithAbsoluteIn(seconds: number) {
    fakeApi.setSessionTimes({ absolute: seconds });
    return openPanel();
  }

  it('sin botón para extender: hora de fin, tiempo en palabras y "Entendido"', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const seconds = WARNING_S + 30;
    const endsAt = formatTime(new Date(Date.now() + seconds * 1000).toISOString());
    await panelWithAbsoluteIn(seconds);

    await advance(31_000);
    const dialog = await screen.findByRole('alertdialog', { name: 'Tu sesión está por terminar' });
    expect(dialog).toHaveAccessibleDescription(
      new RegExp(`Tu sesión termina a las ${endsAt}, en menos de 2 minutos`),
    );
    expect(screen.queryByRole('button', { name: 'Seguir conectado' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Entendido' })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Entendido' }));
    expect(warning()).not.toBeInTheDocument();
    // Descartado: no vuelve a aparecer mientras corre la cuenta.
    await advance(60_000);
    expect(warning()).not.toBeInTheDocument();
  });

  it('descartado, al terminar igual pregunta al servidor (session-status) y avisa el motivo', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { router } = await panelWithAbsoluteIn(WARNING_S);
    await user.click(await screen.findByRole('button', { name: 'Entendido' }));
    expect(count('session-status')).toBe(0);

    await advance(121_000);

    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/ingreso'));
    expect(count('session-status')).toBe(1);
    expect(await screen.findByText(/llegó a su duración máxima/)).toBeInTheDocument();
  });

  it('descartado y con el servidor dándola por válida un instante más: no queda colgado, vuelve a preguntar', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    fakeApi.expiryGraceMs = 1500;
    const { router } = await panelWithAbsoluteIn(WARNING_S);
    await user.click(await screen.findByRole('button', { name: 'Entendido' }));

    await advance(121_000);
    expect(count('session-status')).toBe(1);
    expect(router.state.location.pathname).toBe('/panel/');

    await advance(4_000);
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/ingreso'));
    expect(count('session-status')).toBe(2);
  });

  it('si el vencimiento por inactividad llega antes, vale el aviso con "Seguir conectado"', async () => {
    fakeApi.setSessionTimes({ idle: WARNING_S, absolute: 3 * 3600 });
    await openPanel();
    expect(await screen.findByRole('button', { name: 'Seguir conectado' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Entendido' })).not.toBeInTheDocument();
  });
});

describe('dónde se monta', () => {
  it('no aparece en rutas públicas aunque haya vencimientos guardados', async () => {
    fakeApi.reset({ as: null });
    window.localStorage.setItem(
      SESSION_DEADLINES_KEY,
      JSON.stringify({
        idle: Date.now() + 1_000,
        absolute: Date.now() + 1_000,
        gen: sessionGeneration(),
      }),
    );
    renderApp('/ingreso');
    await screen.findByRole('form', { name: 'Ingreso' });
    await advance(5_000);
    expect(warning()).not.toBeInTheDocument();
  });
});
