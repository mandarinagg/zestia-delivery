import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetToasts } from '@/components/ui/toast';
import {
  MULTI,
  OPERATOR,
  OWNER,
  TENANT_A,
  TENANT_B,
  type FakeUser,
  fakeApi,
} from '@/test/fake-api';
import { renderApp } from '@/test/render-app';
import { ApiError } from '@/lib/api';
import { describeMemberError, grantableRoles } from './member-dialogs';

afterEach(() => resetToasts());

const person = (n: number, name: string): FakeUser => ({
  id: `0192f0c4-1000-7000-8000-${String(n).padStart(12, '0')}`,
  name,
  email: `${name.split(' ')[0]!.toLowerCase()}@ejemplo.test`,
  password: 'una-contraseña-larga',
  memberships: [],
});

const ADMIN = person(1, 'Adriana Admin');

/** Fila de la tabla por nombre de la persona. */
async function row(name: string) {
  const table = await screen.findByRole('table', { name: 'Usuarios' });
  const cell = await within(table).findByText(name);
  return cell.closest('tr')!;
}

const lastRequest = (method: string, path: RegExp) =>
  fakeApi.requests.filter((r) => r.method === method && path.test(r.path)).at(-1);

describe('reglas de la pantalla', () => {
  it('solo un Propietario puede dar el rol Propietario; Repartidor y Comercio no se asignan (R1)', () => {
    expect(grantableRoles(true)).toEqual(['OWNER', 'ADMIN', 'OPERATOR', 'SUPERVISOR']);
    expect(grantableRoles(false)).toEqual(['ADMIN', 'OPERATOR', 'SUPERVISOR']);
  });

  it('los errores de negocio se explican sin códigos', () => {
    const e = (code: string) => new ApiError(409, code);
    expect(describeMemberError(e('LAST_OWNER'))).toMatch(/al menos una persona propietaria/);
    expect(describeMemberError(e('SELF_MODIFICATION'))).toMatch(/tu propio rol/);
    expect(describeMemberError(e('MAIL_DELIVERY_FAILED'))).toMatch(/no se guardó nada/);
  });
});

describe('Usuarios: listado', () => {
  it('/panel/configuracion lleva a Usuarios; muestra solo la empresa activa, con rol y estado', async () => {
    fakeApi.members.seedMember(ADMIN, TENANT_A, 'ADMIN', 'DISABLED');
    fakeApi.members.seedMember(person(2, 'Zoe Otra'), TENANT_B, 'ADMIN');
    const { router } = renderApp('/panel/configuracion');

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/panel/configuracion/usuarios'),
    );
    const table = await screen.findByRole('table', { name: 'Usuarios' });
    const names = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((r) => within(r).getAllByRole('cell')[0]?.querySelector('span')?.textContent);
    expect(names).toEqual([
      'Adriana Admin',
      'Ana Propietaria',
      'Beto Multiempresa',
      'Carla Repartidora',
      'Mario Comercio',
      'Olga Operadora',
    ]);
    expect(within(await row('Ana Propietaria')).getByText('Vos')).toBeInTheDocument();
    expect(within(await row('Adriana Admin')).getByText('Deshabilitado')).toBeInTheDocument();
    expect(within(await row('Ana Propietaria')).getByText('Propietario/a')).toBeInTheDocument();
    expect(screen.queryByText('Zoe Otra')).not.toBeInTheDocument();
  });

  it('filtra por estado y busca en el servidor', async () => {
    fakeApi.members.seedMember(ADMIN, TENANT_A, 'ADMIN', 'DISABLED');
    renderApp('/panel/configuracion/usuarios');
    const user = userEvent.setup();
    await row('Ana Propietaria');

    await user.click(screen.getByRole('radio', { name: 'Deshabilitados' }));
    await waitFor(() => expect(screen.queryByText('Ana Propietaria')).not.toBeInTheDocument());
    expect(await row('Adriana Admin')).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Todos' }));
    await user.type(screen.getByRole('searchbox', { name: 'Buscar por nombre o correo' }), 'olga');
    await waitFor(() => expect(screen.queryByText('Ana Propietaria')).not.toBeInTheDocument());
    expect(await row('Olga Operadora')).toBeInTheDocument();
    expect(lastRequest('GET', /\/members$/)).toBeDefined();
  });

  it('sin `users:read` (Operador) vuelve al inicio del panel', async () => {
    fakeApi.reset({ as: OPERATOR });
    const { router } = renderApp('/panel/configuracion/usuarios');
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/panel\/?$/));
    expect(fakeApi.requests.some((r) => r.path.endsWith('/members'))).toBe(false);
  });

  it('Admin: ve la lista, no puede tocar Propietarios ni darse rol a sí mismo', async () => {
    // Beto es ADMIN en la empresa B; ahí Ana no está, así que sembramos un Propietario.
    fakeApi.reset({ as: MULTI });
    fakeApi.members.seedMember(person(3, 'Pedro Propietario'), TENANT_B, 'OWNER');
    fakeApi.members.seedMember(person(4, 'Iris Operadora'), TENANT_B, 'OPERATOR');
    fakeApi.session!.activeTenantId = TENANT_B;
    renderApp('/panel/configuracion/usuarios');

    const owner = await row('Pedro Propietario');
    expect(within(owner).queryByRole('button', { name: /Acciones/ })).not.toBeInTheDocument();
    const self = await row('Beto Multiempresa');
    expect(within(self).queryByRole('button', { name: /Acciones/ })).not.toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(within(await row('Iris Operadora')).getByRole('button', { name: /Acciones/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Cambiar rol' }));
    const dialog = await screen.findByRole('dialog', { name: /Cambiar el rol/ });
    const options = within(dialog)
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(options).not.toContain('Propietario/a');
  });
});

describe('Usuarios: acciones', () => {
  it('cambia el rol de alguien', async () => {
    fakeApi.members.seedMember(ADMIN, TENANT_A, 'ADMIN');
    renderApp('/panel/configuracion/usuarios');
    const user = userEvent.setup();
    await user.click(within(await row('Adriana Admin')).getByRole('button', { name: /Acciones/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Cambiar rol' }));
    const dialog = await screen.findByRole('dialog', { name: 'Cambiar el rol de Adriana Admin' });
    const submit = within(dialog).getByRole('button', { name: 'Cambiar rol' });
    expect(submit).toBeDisabled();

    await user.selectOptions(within(dialog).getByRole('combobox', { name: /Rol/ }), 'SUPERVISOR');
    await user.click(submit);
    expect(await screen.findByText('Adriana Admin ahora es Supervisor/a')).toBeInTheDocument();
    expect(lastRequest('PATCH', /\/members\//)?.body).toEqual({ role: 'SUPERVISOR' });
    await waitFor(async () =>
      expect(within(await row('Adriana Admin')).getByText('Supervisor/a')).toBeInTheDocument(),
    );
  });

  it('una Propietaria puede deshabilitar a otro Propietario', async () => {
    const omar = fakeApi.members.seedMember(person(5, 'Omar Propietario'), TENANT_A, 'OWNER');
    renderApp('/panel/configuracion/usuarios');
    const user = userEvent.setup();
    await user.click(
      within(await row('Omar Propietario')).getByRole('button', { name: /Acciones/ }),
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Deshabilitar' }));
    const confirm = await screen.findByRole('alertdialog', {
      name: 'Deshabilitar a Omar Propietario',
    });
    await user.click(within(confirm).getByRole('button', { name: 'Deshabilitar' }));
    await waitFor(async () =>
      expect(within(await row('Omar Propietario')).getByText('Deshabilitado')).toBeInTheDocument(),
    );
    expect(omar.status).toBe('DISABLED');
  });

  it('deshabilita y vuelve a habilitar con confirmación', async () => {
    fakeApi.members.seedMember(ADMIN, TENANT_A, 'ADMIN');
    renderApp('/panel/configuracion/usuarios');
    const user = userEvent.setup();
    await user.click(within(await row('Adriana Admin')).getByRole('button', { name: /Acciones/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Deshabilitar' }));
    const confirm = await screen.findByRole('alertdialog', {
      name: 'Deshabilitar a Adriana Admin',
    });
    expect(
      within(confirm).getByText(/Su cuenta y sus otras empresas no cambian/),
    ).toBeInTheDocument();
    await user.click(within(confirm).getByRole('button', { name: 'Deshabilitar' }));
    await waitFor(async () =>
      expect(within(await row('Adriana Admin')).getByText('Deshabilitado')).toBeInTheDocument(),
    );

    await user.click(within(await row('Adriana Admin')).getByRole('button', { name: /Acciones/ }));
    expect(screen.queryByRole('menuitem', { name: 'Cambiar rol' })).not.toBeInTheDocument();
    await user.click(await screen.findByRole('menuitem', { name: 'Habilitar' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Habilitar' }),
    );
    await waitFor(async () =>
      expect(within(await row('Adriana Admin')).getByText('Activo')).toBeInTheDocument(),
    );
  });

  it('un error de la API se explica en lenguaje claro', async () => {
    const target = fakeApi.members.seedMember(ADMIN, TENANT_A, 'ADMIN');
    renderApp('/panel/configuracion/usuarios');
    const user = userEvent.setup();
    await user.click(within(await row('Adriana Admin')).getByRole('button', { name: /Acciones/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Deshabilitar' }));
    target.status = 'DISABLED'; // otra persona lo hizo mientras tanto
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Deshabilitar' }),
    );
    expect(
      await screen.findByText('Esto cambió mientras tanto. Ya actualizamos la lista.'),
    ).toBeInTheDocument();
  });
});

describe('Invitaciones', () => {
  it('invita por correo con un rol y aparece en las abiertas', async () => {
    renderApp('/panel/configuracion/usuarios');
    const user = userEvent.setup();
    await row('Ana Propietaria');
    await user.click(screen.getByRole('button', { name: 'Invitar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Invitar a la empresa' });
    expect(within(dialog).getByText('Recibe, asigna y sigue los pedidos.')).toBeInTheDocument();

    await user.type(
      within(dialog).getByRole('textbox', { name: /Correo/ }),
      '  Nueva@Ejemplo.TEST ',
    );
    await user.selectOptions(within(dialog).getByRole('combobox', { name: /Rol/ }), 'SUPERVISOR');
    await user.click(within(dialog).getByRole('button', { name: 'Enviar invitación' }));

    expect(await screen.findByText('Invitación enviada')).toBeInTheDocument();
    expect(lastRequest('POST', /\/invitations$/)?.body).toEqual({
      email: 'nueva@ejemplo.test',
      role: 'SUPERVISOR',
    });
    const section = await screen.findByRole('region', { name: /Invitaciones abiertas/ });
    expect(within(section).getByText('nueva@ejemplo.test')).toBeInTheDocument();
    expect(within(section).getByText(/Invitó Ana Propietaria/)).toBeInTheDocument();
    expect(fakeApi.members.outbox).toHaveLength(1);
  });

  it('ya es miembro o ya tiene invitación: el error va al campo', async () => {
    fakeApi.members.seedInvitation(TENANT_A, { email: 'pendiente@ejemplo.test' });
    renderApp('/panel/configuracion/usuarios');
    const user = userEvent.setup();
    await row('Ana Propietaria');
    await user.click(screen.getByRole('button', { name: 'Invitar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Invitar a la empresa' });
    const email = within(dialog).getByRole('textbox', { name: /Correo/ });

    await user.type(email, 'olga@zestia.test');
    await user.click(within(dialog).getByRole('button', { name: 'Enviar invitación' }));
    expect(await within(dialog).findByText('Ya es parte de la empresa.')).toBeInTheDocument();

    await user.clear(email);
    await user.type(email, 'pendiente@ejemplo.test');
    await user.click(within(dialog).getByRole('button', { name: 'Enviar invitación' }));
    expect(
      await within(dialog).findByText('Ya tiene una invitación vigente. Reenviala desde la lista.'),
    ).toBeInTheDocument();
  });

  it('el Propietario puede invitar Propietarios; el Admin no ve esa opción', async () => {
    renderApp('/panel/configuracion/usuarios');
    const user = userEvent.setup();
    await row('Ana Propietaria');
    await user.click(screen.getByRole('button', { name: 'Invitar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Invitar a la empresa' });
    expect(within(dialog).getByRole('option', { name: 'Propietario/a' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('option', { name: 'Repartidor/a' })).not.toBeInTheDocument();
  });

  it('reenvía y revoca; las vencidas se marcan', async () => {
    fakeApi.members.seedInvitation(TENANT_A, { email: 'vieja@ejemplo.test', expired: true });
    fakeApi.members.seedInvitation(TENANT_A, { email: 'abierta@ejemplo.test' });
    fakeApi.members.seedInvitation(TENANT_B, { email: 'otra-empresa@ejemplo.test' });
    renderApp('/panel/configuracion/usuarios');
    const user = userEvent.setup();
    const section = await screen.findByRole('region', { name: /Invitaciones abiertas/ });
    expect(within(section).queryByText('otra-empresa@ejemplo.test')).not.toBeInTheDocument();
    const old = within(section).getByText('vieja@ejemplo.test').closest('li')!;
    expect(within(old).getByText('Vencida')).toBeInTheDocument();

    await user.click(
      within(section).getByRole('button', { name: 'Reenviar la invitación a vieja@ejemplo.test' }),
    );
    expect(await screen.findByText('Invitación reenviada')).toBeInTheDocument();
    await waitFor(() => expect(within(old).queryByText('Vencida')).not.toBeInTheDocument());

    await user.click(
      within(section).getByRole('button', { name: 'Revocar la invitación a abierta@ejemplo.test' }),
    );
    await user.click(
      within(await screen.findByRole('alertdialog', { name: 'Revocar invitación' })).getByRole(
        'button',
        { name: 'Revocar' },
      ),
    );
    await waitFor(() => expect(screen.queryByText('abierta@ejemplo.test')).not.toBeInTheDocument());
  });
});

describe('Aceptar una invitación (/invitacion)', () => {
  beforeEach(() => fakeApi.reset({ as: null }));

  it('sin cuenta: crea la cuenta, saca el token de la URL y no inicia sesión', async () => {
    const { token } = fakeApi.members.seedInvitation(TENANT_A, {
      email: 'nueva@ejemplo.test',
      role: 'SUPERVISOR',
    });
    const { router } = renderApp(`/invitacion#token=${token}`);
    expect(
      await screen.findByRole('heading', { name: 'Te invitaron a Delivery Demo Asunción' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Supervisor/a')).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.hash).toBe(''));

    const user = userEvent.setup();
    const form = screen.getByRole('form', { name: 'Crear tu cuenta' });
    await user.click(within(form).getByRole('button', { name: 'Crear cuenta y aceptar' }));
    expect(await within(form).findByText('Ingresá tu nombre.')).toBeInTheDocument();

    await user.type(within(form).getByRole('textbox', { name: /Tu nombre/ }), 'Nora Nueva');
    await user.type(within(form).getByLabelText(/^Contraseña/), 'una-contraseña-larga');
    await user.type(within(form).getByLabelText(/^Repetir contraseña/), 'una-contraseña-larga');
    await user.click(within(form).getByRole('button', { name: 'Crear cuenta y aceptar' }));

    expect(
      await screen.findByRole('heading', { name: 'Listo, ya sos parte de Delivery Demo Asunción' }),
    ).toBeInTheDocument();
    expect(lastRequest('POST', /\/auth\/invitations\/accept$/)?.body).toEqual({
      token,
      name: 'Nora Nueva',
      password: 'una-contraseña-larga',
    });
    expect(fakeApi.session).toBeNull();
    expect(screen.getByRole('link', { name: 'Ir al ingreso' })).toHaveAttribute('href', '/ingreso');
  });

  it('con cuenta: un botón, sin pedir datos', async () => {
    const { token } = fakeApi.members.seedInvitation(TENANT_B, {
      email: OWNER.email,
      role: 'ADMIN',
    });
    renderApp(`/invitacion#token=${token}`);
    expect(await screen.findByText(/Ya tenés una cuenta con ese correo/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Contraseña/)).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Aceptar la invitación' }));
    expect(
      await screen.findByText(/Vas a ver la empresa nueva en el selector/),
    ).toBeInTheDocument();
    expect(lastRequest('POST', /\/auth\/invitations\/accept$/)?.body).toEqual({ token });
  });

  it.each([
    ['sin token', '/invitacion'],
    ['token mal formado', '/invitacion#token=corto'],
    ['token desconocido', `/invitacion#token=${'z'.repeat(43)}`],
  ])('enlace inválido (%s): explica qué hacer', async (_, path) => {
    renderApp(path);
    expect(
      await screen.findByRole('heading', { name: 'Esta invitación ya no sirve' }),
    ).toBeInTheDocument();
  });

  it('vencida o revocada: inválida', async () => {
    const expired = fakeApi.members.seedInvitation(TENANT_A, {
      email: 'x@ejemplo.test',
      expired: true,
    });
    renderApp(`/invitacion#token=${expired.token}`);
    expect(
      await screen.findByRole('heading', { name: 'Esta invitación ya no sirve' }),
    ).toBeInTheDocument();
  });
});
