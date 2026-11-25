import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetToasts } from '@/components/ui/toast';
import { formatTime } from '@/lib/format';
import { SESSION_DEADLINES_KEY } from '@/lib/session-clock';
import { fakeApi } from '@/test/fake-api';
import { renderApp } from '@/test/render-app';
import { SESSION_WARNING_MS, formatCountdown } from './session-expiry-notice';

/*
 * Reloj falso con `shouldAdvanceTime`: avanza solo con el tiempo real (así `findBy…` sigue
 * andando) y `advance()` lo adelanta de golpe. Los vencimientos salen de lo que informa la API
 * falsa (`fakeApi.idleRemaining` / `absoluteRemaining`), no de un reloj del test.
 */
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => {
  resetToasts();
  vi.useRealTimers();
});

const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

const meRequests = () => fakeApi.requests.filter((r) => r.path === '/api/v1/auth/me').length;

async function openPanel() {
  const view = renderApp('/panel/');
  await screen.findByRole('button', { name: 'Menú de usuario', hidden: true });
  return view;
}

const warning = () => screen.queryByRole('alertdialog');

/** Deja el panel abierto con el aviso por aparecer en `secondsToWarning` segundos. */
async function panelWithWarningIn(secondsToWarning: number) {
  const remaining = SESSION_WARNING_MS / 1000 + secondsToWarning;
  fakeApi.idleRemaining = remaining;
  fakeApi.absoluteRemaining = 12 * 3600;
  return openPanel();
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
  it('aparece 2 minutos antes del vencimiento, con el foco en "Seguir conectado"', async () => {
    await panelWithWarningIn(60);
    expect(warning()).not.toBeInTheDocument();

    await advance(59_000);
    expect(warning()).not.toBeInTheDocument();

    await advance(2_000);
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Tu sesión va a cerrarse por inactividad',
    });
    expect(dialog).toHaveAccessibleDescription(/Por seguridad/);
    expect(screen.getByRole('timer')).toHaveTextContent(/^02:0\d$|^01:5\d$/);
    expect(screen.getByRole('button', { name: 'Seguir conectado' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();
  });

  it('la cuenta baja cada segundo, sin anunciarse (role timer, aria-live off)', async () => {
    await panelWithWarningIn(0);
    await screen.findByRole('alertdialog');
    const timer = screen.getByRole('timer');
    expect(timer).toHaveAttribute('aria-live', 'off');
    await advance(61_000);
    expect(timer).toHaveTextContent(/^00:5\d$|^01:0\d$/);
    // El aviso se lee al abrir (descripción del diálogo); dentro no hay otra región viva.
    expect(within(screen.getByRole('alertdialog')).queryByRole('status')).not.toBeInTheDocument();
  });

  it('"Seguir conectado" renueva la sesión (GET /auth/me) y cierra el aviso', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await panelWithWarningIn(0);
    await screen.findByRole('alertdialog');
    const before = meRequests();

    fakeApi.idleRemaining = 30 * 60; // la API renovó
    await user.click(screen.getByRole('button', { name: 'Seguir conectado' }));

    await vi.waitFor(() => expect(warning()).not.toBeInTheDocument());
    expect(meRequests()).toBe(before + 1);
    // Y vuelve a avisar 28 minutos después, no antes.
    await advance(27 * 60_000);
    expect(warning()).not.toBeInTheDocument();
    await advance(2 * 60_000);
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
  });

  it('"Cerrar sesión" usa el logout normal y vuelve al ingreso', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { router } = await panelWithWarningIn(0);
    await screen.findByRole('alertdialog');

    await user.click(screen.getByRole('button', { name: 'Cerrar sesión' }));

    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/ingreso'));
    expect(fakeApi.requests.some((r) => r.path === '/api/v1/auth/logout')).toBe(true);
    expect(fakeApi.session).toBeNull();
  });

  it('no se cierra con Escape (hay que elegir)', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await panelWithWarningIn(0);
    await screen.findByRole('alertdialog');
    await user.keyboard('{Escape}');
    expect(warning()).toBeInTheDocument();
  });

  it('nunca pregunta al servidor antes de llegar a cero (sin polling)', async () => {
    await panelWithWarningIn(0);
    await screen.findByRole('alertdialog');
    const before = meRequests();
    await advance(100_000);
    expect(meRequests()).toBe(before);
  });
});

describe('al llegar a cero', () => {
  it('con 401 limpia la sesión y va al ingreso con el motivo', async () => {
    const { router } = await panelWithWarningIn(0);
    await screen.findByRole('alertdialog');
    const before = meRequests();

    fakeApi.expireSession();
    await advance(121_000);

    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/ingreso'));
    expect(meRequests()).toBe(before + 1);
    expect(router.state.location.search).toMatchObject({ reason: 'idle' });
    expect(await screen.findByText(/Tu sesión se cerró por inactividad/)).toBeInTheDocument();
    expect(warning()).not.toBeInTheDocument();
  });

  it('con 200 (otra pestaña renovó) sigue sin aviso ni redirección', async () => {
    const { router } = await panelWithWarningIn(0);
    await screen.findByRole('alertdialog');
    const before = meRequests();

    fakeApi.idleRemaining = 30 * 60; // el servidor sigue con la sesión viva
    await advance(121_000);

    await vi.waitFor(() => expect(warning()).not.toBeInTheDocument());
    expect(meRequests()).toBe(before + 1);
    expect(router.state.location.pathname).toBe('/panel/');
    expect(fakeApi.session).not.toBeNull();
  });
});

describe('varias pestañas', () => {
  it('si otra pestaña renueva mientras el aviso está abierto, se cierra solo', async () => {
    await panelWithWarningIn(0);
    await screen.findByRole('alertdialog');
    const before = meRequests();

    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: SESSION_DEADLINES_KEY,
          newValue: JSON.stringify({
            idle: Date.now() + 30 * 60_000,
            absolute: Date.now() + 12 * 3600_000,
          }),
        }),
      );
    });

    await vi.waitFor(() => expect(warning()).not.toBeInTheDocument());
    expect(meRequests()).toBe(before);
  });

  it('un vencimiento más viejo de otra pestaña no adelanta el aviso', async () => {
    await panelWithWarningIn(300);
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: SESSION_DEADLINES_KEY,
          newValue: JSON.stringify({ idle: Date.now() + 1_000, absolute: Date.now() + 1_000 }),
        }),
      );
    });
    await advance(10_000);
    expect(warning()).not.toBeInTheDocument();
  });
});

describe('aviso del tiempo máximo de la sesión', () => {
  it('sin botón para extender: hora de fin en la zona del tenant y "Entendido"', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const seconds = SESSION_WARNING_MS / 1000 + 30;
    fakeApi.idleRemaining = seconds; // el de inactividad nunca pasa el absoluto
    fakeApi.absoluteRemaining = seconds;
    const endsAt = formatTime(new Date(Date.now() + seconds * 1000).toISOString());
    await openPanel();

    await advance(31_000);
    const dialog = await screen.findByRole('alertdialog', { name: 'Tu sesión está por terminar' });
    expect(dialog).toHaveAccessibleDescription(
      `Tu sesión termina a las ${endsAt}. Guardá tus cambios y volvé a ingresar.`,
    );
    expect(screen.queryByRole('button', { name: 'Seguir conectado' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Entendido' })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Entendido' }));
    expect(warning()).not.toBeInTheDocument();
    // Descartado: no vuelve a aparecer mientras corre la cuenta.
    await advance(60_000);
    expect(warning()).not.toBeInTheDocument();
  });

  it('al terminar (aunque se haya descartado) pregunta al servidor y avisa el motivo', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const seconds = SESSION_WARNING_MS / 1000;
    fakeApi.idleRemaining = seconds;
    fakeApi.absoluteRemaining = seconds;
    const { router } = await openPanel();
    await user.click(await screen.findByRole('button', { name: 'Entendido' }));

    fakeApi.expireSession();
    await advance(121_000);

    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/ingreso'));
    expect(await screen.findByText(/llegó a su duración máxima/)).toBeInTheDocument();
  });

  it('si el vencimiento por inactividad llega antes, vale el aviso con "Seguir conectado"', async () => {
    fakeApi.idleRemaining = SESSION_WARNING_MS / 1000;
    fakeApi.absoluteRemaining = 3 * 3600;
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
      JSON.stringify({ idle: Date.now() + 1_000, absolute: Date.now() + 1_000 }),
    );
    renderApp('/ingreso');
    await screen.findByRole('form', { name: 'Ingreso' });
    await advance(5_000);
    expect(warning()).not.toBeInTheDocument();
  });
});
