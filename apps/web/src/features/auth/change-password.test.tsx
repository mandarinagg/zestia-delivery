import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetToasts } from '@/components/ui/toast';
import { FAKE_CSRF_TOKEN, OWNER, fakeApi } from '@/test/fake-api';
import { renderApp } from '@/test/render-app';
import { changePasswordSchema } from './auth-api';

afterEach(() => resetToasts());

const NEW_PASSWORD = 'una frase nueva y bastante larga';

/** Abre el diálogo desde el menú de usuario del panel. */
async function openDialog() {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Menú de usuario' }));
  await user.click(await screen.findByRole('menuitem', { name: 'Cambiar contraseña' }));
  const dialog = await screen.findByRole('dialog', { name: 'Cambiar contraseña' });
  return { user, dialog };
}

/** Completa los campos pegando el texto (tipear letra por letra es lento con la máquina cargada). */
async function fill(
  user: ReturnType<typeof userEvent.setup>,
  dialog: HTMLElement,
  values: { current?: string; password?: string; confirm?: string },
) {
  const fields = [
    [/^Contraseña actual/, values.current],
    [/^Contraseña nueva/, values.password],
    [/^Repetir contraseña nueva/, values.confirm],
  ] as const;
  for (const [label, value] of fields) {
    if (value === undefined) continue;
    await user.click(within(dialog).getByLabelText(label));
    await user.paste(value);
  }
}

const changeRequests = () => fakeApi.requests.filter((r) => r.path.endsWith('/change-password'));

describe('reglas del formulario', () => {
  it('la nueva: largo mínimo, coincidir y ser distinta de la actual', () => {
    const errors = (v: { current: string; password: string; confirm: string }) =>
      changePasswordSchema
        .safeParse(v)
        .error?.issues.map((i) => `${String(i.path[0])}: ${i.message}`) ?? [];
    expect(errors({ current: 'x', password: NEW_PASSWORD, confirm: NEW_PASSWORD })).toEqual([]);
    expect(errors({ current: '', password: 'corta', confirm: 'corta' })).toEqual([
      'current: Ingresá tu contraseña actual.',
      'password: Usá al menos 12 caracteres.',
    ]);
    expect(errors({ current: 'x', password: NEW_PASSWORD, confirm: 'otra cosa' })).toEqual([
      'confirm: Las contraseñas no coinciden.',
    ]);
    expect(
      errors({ current: NEW_PASSWORD, password: NEW_PASSWORD, confirm: NEW_PASSWORD }),
    ).toEqual(['password: Tiene que ser distinta de la actual.']);
  });
});

describe('Cambiar contraseña', () => {
  it('desde el menú de usuario: cambia, avisa, cierra y sigue con el token CSRF nuevo', async () => {
    const { router } = renderApp('/panel/');
    const { user, dialog } = await openDialog();

    await fill(user, dialog, {
      current: OWNER.password,
      password: NEW_PASSWORD,
      confirm: NEW_PASSWORD,
    });
    const reqs = within(dialog).getByRole('list');
    expect(
      within(reqs)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([
      'Al menos 12 caracteres (cumplido)',
      'Las dos coinciden (cumplido)',
      'Distinta de la actual (cumplido)',
    ]);
    await user.click(within(dialog).getByRole('button', { name: 'Guardar contraseña' }));

    expect(await screen.findByText('Cambiaste tu contraseña')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const [request] = changeRequests();
    expect(request?.body).toEqual({ currentPassword: OWNER.password, newPassword: NEW_PASSWORD });
    expect(request?.csrf).toBe(FAKE_CSRF_TOKEN);
    expect(fakeApi.users.find((u) => u.id === OWNER.id)?.password).toBe(NEW_PASSWORD);

    // La sesión rotó: la próxima mutación tiene que ir con el token nuevo (si no, 403).
    expect(fakeApi.csrf).not.toBe(FAKE_CSRF_TOKEN);
    await user.click(screen.getByRole('button', { name: 'Menú de usuario' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Cerrar sesión' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/ingreso'));
    const logout = fakeApi.requests.find((r) => r.path.endsWith('/logout'));
    expect(logout?.csrf).toBe(fakeApi.csrf);
    expect(fakeApi.session).toBeNull();
  });

  it('contraseña actual incorrecta: error en el campo, con foco, y no cambia nada', async () => {
    renderApp('/panel/');
    const { user, dialog } = await openDialog();
    await fill(user, dialog, {
      current: 'no-es-la-actual',
      password: NEW_PASSWORD,
      confirm: NEW_PASSWORD,
    });
    await user.click(within(dialog).getByRole('button', { name: 'Guardar contraseña' }));

    const current = within(dialog).getByLabelText(/^Contraseña actual/);
    expect(await within(dialog).findByText(/No es tu contraseña actual/)).toBeInTheDocument();
    expect(current).toHaveAttribute('aria-invalid', 'true');
    await waitFor(() => expect(current).toHaveFocus());
    expect(fakeApi.users.find((u) => u.id === OWNER.id)?.password).toBe(OWNER.password);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('los errores del formulario se muestran sin llamar a la API', async () => {
    renderApp('/panel/');
    const { user, dialog } = await openDialog();
    await fill(user, dialog, { current: OWNER.password, password: 'corta', confirm: 'otra' });
    await user.click(within(dialog).getByRole('button', { name: 'Guardar contraseña' }));

    expect(await within(dialog).findByText('Usá al menos 12 caracteres.')).toBeInTheDocument();
    expect(changeRequests()).toHaveLength(0);
  });

  it('demasiados intentos: avisa cuánto esperar', async () => {
    fakeApi.changePasswordRetryAfter = 90;
    renderApp('/panel/');
    const { user, dialog } = await openDialog();
    await fill(user, dialog, {
      current: OWNER.password,
      password: NEW_PASSWORD,
      confirm: NEW_PASSWORD,
    });
    await user.click(within(dialog).getByRole('button', { name: 'Guardar contraseña' }));

    expect(await within(dialog).findByText(/Esperá 2 minutos/)).toBeInTheDocument();
    expect(fakeApi.users.find((u) => u.id === OWNER.id)?.password).toBe(OWNER.password);
  });

  it('con la sesión vencida vuelve al ingreso', async () => {
    const { router } = renderApp('/panel/');
    const { user, dialog } = await openDialog();
    await fill(user, dialog, {
      current: OWNER.password,
      password: NEW_PASSWORD,
      confirm: NEW_PASSWORD,
    });
    fakeApi.expireSession();
    await user.click(within(dialog).getByRole('button', { name: 'Guardar contraseña' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/ingreso'));
  });

  it('cancelar descarta lo escrito', async () => {
    renderApp('/panel/');
    const first = await openDialog();
    await fill(first.user, first.dialog, { current: 'algo' });
    await first.user.click(within(first.dialog).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    const second = await openDialog();
    expect(within(second.dialog).getByLabelText(/^Contraseña actual/)).toHaveValue('');
  });
});
