import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetToasts } from '@/components/ui/toast';
import {
  COURIER,
  EXPIRED_RESET_TOKEN,
  FAKE_CSRF_TOKEN,
  MULTI,
  OWNER,
  VALID_RESET_TOKEN,
  fakeApi,
} from '@/test/fake-api';
import { renderApp } from '@/test/render-app';
import { safeRedirect, tokenFromHash } from './auth-api';

afterEach(() => resetToasts());

/** El Toaster también expone role=alert (vacío): buscamos por texto y subimos al contenedor. */
async function findAlert(text: RegExp | string) {
  return (await screen.findByText(text)).closest('[role="alert"]');
}

async function fillLogin(email: string, password: string) {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText(/Correo/), email);
  await user.type(screen.getByLabelText(/^Contraseña/), password);
  await user.click(screen.getByRole('button', { name: 'Ingresar' }));
  return user;
}

describe('Rutas protegidas', () => {
  it('sin sesión, el panel manda al ingreso recordando adónde iba', async () => {
    fakeApi.reset({ as: null });
    const { router } = renderApp('/panel/pedidos');
    expect(await screen.findByRole('heading', { name: 'Ingresá al panel' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/ingreso');
    expect(router.state.location.search).toEqual({ redirect: '/panel/pedidos' });
  });

  it('con sesión, el ingreso manda directo al inicio del rol', async () => {
    const { router } = renderApp('/ingreso');
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/panel\/?$/));
  });

  it('un repartidor no entra al panel: va a su app', async () => {
    fakeApi.reset({ as: COURIER });
    const { router } = renderApp('/panel/');
    await waitFor(() => expect(router.state.location.pathname).toBe('/repartidor'));
  });

  it('con varias empresas y ninguna elegida, el panel manda al selector', async () => {
    fakeApi.reset({ as: MULTI });
    const { router } = renderApp('/panel/');
    expect(
      await screen.findByRole('heading', { name: '¿Con qué empresa trabajás hoy?' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/ingreso/empresa');
  });
});

describe('Ingreso', () => {
  beforeEach(() => fakeApi.reset({ as: null }));

  it('muestra errores accesibles si se envía vacío, sin llamar a la API', async () => {
    const user = userEvent.setup();
    renderApp('/ingreso');
    await user.click(await screen.findByRole('button', { name: 'Ingresar' }));
    expect(await screen.findByText('Ingresá tu correo.')).toBeInTheDocument();
    expect(screen.getByText('Ingresá tu contraseña.')).toBeInTheDocument();
    const email = screen.getByLabelText(/Correo/);
    expect(email).toBeInvalid();
    expect(email).toHaveFocus();
    expect(fakeApi.requests.filter((r) => r.path.endsWith('/login'))).toEqual([]);
  });

  it('muestra y oculta la contraseña con aria-pressed', async () => {
    const user = userEvent.setup();
    renderApp('/ingreso');
    const toggle = await screen.findByRole('button', { name: 'Mostrar contraseña' });
    const password = screen.getByLabelText(/^Contraseña/);
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(password).toHaveAttribute('type', 'password');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(password).toHaveAttribute('type', 'text');
  });

  it('con credenciales incorrectas muestra un error genérico y enfocado', async () => {
    renderApp('/ingreso');
    await fillLogin(OWNER.email, 'no-es-la-contraseña');
    const alert = await findAlert(/El correo o la contraseña no coinciden/);
    expect(alert).toHaveFocus();
  });

  it('con demasiados intentos dice cuánto esperar', async () => {
    fakeApi.loginRetryAfter = 120;
    renderApp('/ingreso');
    await fillLogin(OWNER.email, OWNER.password);
    expect(await findAlert(/Esperá 2 minutos/)).toBeInTheDocument();
  });

  it('sin conexión con el servidor lo dice claramente', async () => {
    renderApp('/ingreso');
    await screen.findByLabelText(/Correo/);
    fakeApi.offline = true;
    await fillLogin(OWNER.email, OWNER.password);
    expect(await findAlert(/No pudimos conectar con el servidor/)).toBeInTheDocument();
  });

  it('con una sola empresa entra directo y vuelve adonde iba', async () => {
    const { router } = renderApp('/panel/pedidos');
    await fillLogin(`  ${OWNER.email.toUpperCase()} `, OWNER.password);
    await waitFor(() => expect(router.state.location.pathname).toBe('/panel/pedidos'));
    expect(await screen.findByRole('heading', { name: 'Pedidos' })).toBeInTheDocument();
  });

  it('ignora un redirect externo (redirección abierta)', async () => {
    const { router } = renderApp('/ingreso?redirect=%2F%2Fevil.example');
    await fillLogin(OWNER.email, OWNER.password);
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/panel\/?$/));
  });

  it('con varias empresas pasa al selector; las suspendidas no se pueden elegir', async () => {
    const { router } = renderApp('/ingreso');
    const user = await fillLogin(MULTI.email, MULTI.password);
    expect(
      await screen.findByRole('heading', { name: '¿Con qué empresa trabajás hoy?' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(2);
    expect(screen.queryByRole('radio', { name: /Envíos Pausados/ })).not.toBeInTheDocument();
    expect(screen.getByText('Envíos Pausados (suspendida)')).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: /Mensajería Luque/ }));
    await user.click(screen.getByRole('button', { name: 'Entrar a Mensajería Luque' }));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/panel\/?$/));
    const switchCall = fakeApi.requests.find((r) => r.path.endsWith('/switch-tenant'));
    // Mutación con sesión: lleva el token CSRF recibido en el login.
    expect(switchCall?.csrf).toBe(FAKE_CSRF_TOKEN);
    expect(
      await screen.findByRole('button', { name: /Empresa activa: Mensajería Luque/ }),
    ).toBeInTheDocument();
  });

  it('"Usar otra cuenta" cierra la sesión y vuelve al ingreso', async () => {
    fakeApi.reset({ as: MULTI });
    const { router } = renderApp('/ingreso/empresa');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Usar otra cuenta' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/ingreso'));
    expect(fakeApi.session).toBeNull();
  });
});

describe('Sesión en el panel', () => {
  it('muestra el usuario y la empresa reales, y cierra la sesión', async () => {
    const { router } = renderApp('/panel/');
    const user = userEvent.setup();
    expect(
      await screen.findByRole('button', { name: /Empresa activa: Delivery Demo Asunción/ }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Menú de usuario' }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByText(OWNER.name)).toBeInTheDocument();
    expect(within(menu).getByText(OWNER.email)).toBeInTheDocument();
    await user.click(within(menu).getByRole('menuitem', { name: 'Cerrar sesión' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/ingreso'));
    const logout = fakeApi.requests.find((r) => r.path.endsWith('/logout'));
    expect(logout?.csrf).toBe(FAKE_CSRF_TOKEN);
    expect(fakeApi.session).toBeNull();
  });

  it('cambia de empresa desde el menú de arriba', async () => {
    fakeApi.reset({ as: MULTI });
    fakeApi.session!.activeTenantId = MULTI.memberships[0]!.tenantId;
    renderApp('/panel/');
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: /Empresa activa: Delivery Demo Asunción/ }),
    );
    await user.click(await screen.findByRole('menuitem', { name: /Mensajería Luque/ }));
    expect(await screen.findByText('Ahora estás en Mensajería Luque')).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: /Empresa activa: Mensajería Luque/ }),
    ).toBeInTheDocument();
  });

  it('esconde secciones sin permiso (Operador ve Comercios pero no Configuración)', async () => {
    fakeApi.reset({ as: MULTI });
    fakeApi.session!.activeTenantId = MULTI.memberships[0]!.tenantId; // OPERATOR
    renderApp('/panel/');
    const nav = await screen.findByRole('navigation', { name: 'Principal' });
    expect(within(nav).getByRole('link', { name: 'Despacho' })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'Comercios' })).toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: 'Configuración' })).not.toBeInTheDocument();
  });

  it('si la sesión vence, el próximo pedido a la API vuelve al ingreso', async () => {
    const { router } = renderApp('/panel/');
    await screen.findByRole('navigation', { name: 'Principal' });
    fakeApi.expireSession();
    await router.options.context.queryClient.refetchQueries({ queryKey: ['session'] });
    await router.invalidate();
    await waitFor(() => expect(router.state.location.pathname).toBe('/ingreso'));
  });
});

describe('Recuperar y restablecer contraseña', () => {
  beforeEach(() => fakeApi.reset({ as: null }));

  it('pedir el enlace confirma sin revelar si la cuenta existe', async () => {
    const user = userEvent.setup();
    renderApp('/olvide-contrasena');
    await user.type(await screen.findByLabelText(/Correo/), 'alguien@ejemplo.com.py');
    await user.click(screen.getByRole('button', { name: 'Enviar enlace' }));
    const status = (await screen.findByText(/Si hay una cuenta con/)).closest('[role="status"]');
    expect(status).toHaveTextContent('alguien@ejemplo.com.py');
    expect(status).toHaveFocus();
    expect(fakeApi.requests.at(-1)).toMatchObject({
      method: 'POST',
      path: '/api/v1/auth/forgot-password',
      body: { email: 'alguien@ejemplo.com.py' },
    });
  });

  it('lee el token de location.hash y lo saca de la URL', async () => {
    const { router } = renderApp(`/restablecer-contrasena#token=${VALID_RESET_TOKEN}`);
    expect(
      await screen.findByRole('heading', { name: 'Creá tu contraseña nueva' }),
    ).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.hash).toBe(''));
  });

  it('sin token o con formato inválido ofrece pedir un enlace nuevo', async () => {
    renderApp('/restablecer-contrasena#token=corto');
    expect(await screen.findByRole('heading', { name: 'Este enlace ya no sirve' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Pedir un enlace nuevo' })).toBeInTheDocument();
  });

  it('valida largo y coincidencia, y confirma el cambio', async () => {
    const user = userEvent.setup();
    renderApp(`/restablecer-contrasena#token=${VALID_RESET_TOKEN}`);
    const nueva = await screen.findByLabelText(/^Contraseña nueva/);
    await user.type(nueva, 'corta');
    await user.type(screen.getByLabelText(/^Repetir contraseña/), 'otra');
    await user.click(screen.getByRole('button', { name: 'Guardar contraseña' }));
    expect(await screen.findByText('Usá al menos 12 caracteres.')).toBeInTheDocument();
    expect(screen.getByText('Las contraseñas no coinciden.')).toBeInTheDocument();
    expect(nueva).toHaveAccessibleDescription(/Al menos 12 caracteres/);

    await user.clear(nueva);
    await user.type(nueva, 'una frase larga');
    const repetir = screen.getByLabelText(/^Repetir contraseña/);
    await user.clear(repetir);
    await user.type(repetir, 'una frase larga');
    await user.click(screen.getByRole('button', { name: 'Guardar contraseña' }));
    expect(
      await screen.findByRole('heading', { name: 'Listo, ya tenés contraseña nueva' }),
    ).toBeInTheDocument();
    expect(fakeApi.requests.at(-1)?.body).toEqual({
      token: VALID_RESET_TOKEN,
      password: 'una frase larga',
    });
  });

  it('si el servidor dice que el enlace venció, ofrece pedir otro', async () => {
    const user = userEvent.setup();
    renderApp(`/restablecer-contrasena#token=${EXPIRED_RESET_TOKEN}`);
    for (const label of [/^Contraseña nueva/, /^Repetir contraseña/]) {
      await user.type(await screen.findByLabelText(label), 'una frase larga');
    }
    await user.click(screen.getByRole('button', { name: 'Guardar contraseña' }));
    expect(await screen.findByRole('heading', { name: 'Este enlace ya no sirve' })).toBeVisible();
  });
});

describe('utilidades', () => {
  it('tokenFromHash acepta el fragmento con o sin #', () => {
    expect(tokenFromHash('#token=abc')).toBe('abc');
    expect(tokenFromHash('token=abc&x=1')).toBe('abc');
    expect(tokenFromHash('')).toBeNull();
    expect(tokenFromHash('#token=')).toBeNull();
  });

  it.each([
    ['/panel/pedidos', '/panel/pedidos'],
    ['/panel/pedidos?x=1', '/panel/pedidos?x=1'],
    ['//evil.example', null],
    ['/\\evil.example', null],
    ['https://evil.example', null],
    ['/redirect?to=https://evil.example', null],
    ['panel', null],
    ['/ingreso', null],
    [undefined, null],
  ])('safeRedirect(%s) → %s', (input, expected) => {
    expect(safeRedirect(input)).toBe(expected);
  });
});
