import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetToasts } from '@/components/ui/toast';
import { OPERATOR, TENANT_A, TENANT_B, fakeApi } from '@/test/fake-api';
import { renderApp } from '@/test/render-app';
import { describeHours, formatPhone } from './merchant-format';

afterEach(() => resetToasts());

const seed = (data: Parameters<typeof fakeApi.merchants.seed>[1], tenantId = TENANT_A) =>
  fakeApi.merchants.seed(tenantId, data);

const lastRequest = (method: string, path: RegExp) =>
  fakeApi.requests.filter((r) => r.method === method && path.test(r.path)).at(-1);

describe('formato', () => {
  it('teléfonos de Paraguay en formato local; el resto, tal cual', () => {
    expect(formatPhone('+595981123456')).toBe('0981 123 456');
    expect(formatPhone('+59521600000')).toBe('021 600 000');
    expect(formatPhone('+5491112345678')).toBe('+5491112345678');
    expect(formatPhone(null)).toBe('');
  });

  it('horario: días sin franjas = cerrado', () => {
    const hours = describeHours({
      mon: [
        { from: '08:00', to: '12:00' },
        { from: '14:00', to: '18:00' },
      ],
    });
    expect(hours[0]).toEqual({ day: 'mon', text: '08:00–12:00, 14:00–18:00' });
    expect(hours[6]).toEqual({ day: 'sun', text: 'Cerrado' });
  });
});

describe('Listado de comercios', () => {
  it('muestra los vigentes de la empresa activa, con estado, teléfono y sucursales', async () => {
    seed({ name: 'Farmacia Central', phone: '+595981123456', branches: [{}, {}] });
    seed({ name: 'Bodega Norte', status: 'SUSPENDED', ruc: '80012345-6' });
    seed({ name: 'Archivado Viejo', status: 'ARCHIVED' });
    seed({ name: 'De otra empresa' }, TENANT_B);
    renderApp('/panel/comercios');

    const table = await screen.findByRole('table', { name: 'Comercios' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((r) => within(r).getAllByRole('cell')[0]?.textContent)).toEqual([
      'Bodega Norte',
      'Farmacia Central',
    ]);
    expect(within(rows[0]!).getByText('Suspendido')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('0981 123 456')).toBeInTheDocument();
    expect(within(rows[1]!).getAllByRole('cell').at(-1)).toHaveTextContent('2');
    expect(screen.queryByText('De otra empresa')).not.toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole('radio', { name: 'Archivados' }));
    expect(await screen.findByRole('link', { name: 'Archivado Viejo' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Farmacia Central' })).not.toBeInTheDocument();
  });

  it('busca por nombre o RUC en el servidor', async () => {
    seed({ name: 'Farmacia Central' });
    seed({ name: 'Bodega Norte', ruc: '80012345-6' });
    renderApp('/panel/comercios');
    const user = userEvent.setup();
    await screen.findByRole('link', { name: 'Farmacia Central' });

    await user.type(screen.getByRole('searchbox', { name: 'Buscar por nombre o RUC' }), '8001');
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: 'Farmacia Central' })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('link', { name: 'Bodega Norte' })).toBeInTheDocument();
    expect(lastRequest('GET', /\/merchants$/)).toBeDefined();
  });

  it('pagina con "Cargar más"', async () => {
    for (let i = 0; i < 55; i++) seed({ name: `Comercio ${String(i).padStart(2, '0')}` });
    renderApp('/panel/comercios');
    await screen.findByRole('link', { name: 'Comercio 00' });
    expect(screen.queryByRole('link', { name: 'Comercio 54' })).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Cargar más' }));
    expect(await screen.findByRole('link', { name: 'Comercio 54' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();
  });

  it('vacío: invita a crear el primero', async () => {
    renderApp('/panel/comercios');
    expect(await screen.findByText('Todavía no hay comercios')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Nuevo comercio' })).toHaveLength(2);
  });

  it('un Operador ve el listado pero no puede crear', async () => {
    fakeApi.reset({ as: OPERATOR });
    seed({ name: 'Farmacia Central' });
    renderApp('/panel/comercios');
    expect(await screen.findByRole('link', { name: 'Farmacia Central' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nuevo comercio' })).not.toBeInTheDocument();
  });
});

describe('Alta de comercio', () => {
  it('valida con el contrato, normaliza el teléfono y abre el detalle', async () => {
    const { router } = renderApp('/panel/comercios');
    const user = userEvent.setup();
    await user.click((await screen.findAllByRole('button', { name: 'Nuevo comercio' }))[0]!);
    const dialog = await screen.findByRole('dialog', { name: 'Nuevo comercio' });

    await user.type(within(dialog).getByLabelText(/^Nombre/), 'La Esquina');
    await user.type(within(dialog).getByLabelText(/^Teléfono/), 'llamar a Juan');
    await user.click(within(dialog).getByRole('button', { name: 'Crear comercio' }));
    expect(await within(dialog).findByText(/teléfono/i, { selector: 'p' })).toBeInTheDocument();
    expect(lastRequest('POST', /\/merchants$/)).toBeUndefined();

    await user.clear(within(dialog).getByLabelText(/^Teléfono/));
    await user.type(within(dialog).getByLabelText(/^Teléfono/), '0981 123 456');
    await user.click(within(dialog).getByRole('button', { name: 'Crear comercio' }));

    expect(
      await screen.findByRole('heading', { name: 'La Esquina', level: 1 }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toMatch(/^\/panel\/comercios\/[0-9a-f-]{36}$/);
    expect(lastRequest('POST', /\/merchants$/)?.body).toEqual({
      name: 'La Esquina',
      ruc: null,
      phone: '+595981123456',
    });
    expect(screen.getByText('Sin sucursales')).toBeInTheDocument();
  });

  it('nombre repetido: el error aparece en el campo', async () => {
    seed({ name: 'La Esquina' });
    renderApp('/panel/comercios');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Nuevo comercio' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nuevo comercio' });
    await user.type(within(dialog).getByLabelText(/^Nombre/), 'la esquina');
    await user.click(within(dialog).getByRole('button', { name: 'Crear comercio' }));
    expect(
      await within(dialog).findByText('Ya hay un comercio con ese nombre.'),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/^Nombre/)).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('Detalle de comercio', () => {
  it('edita los datos', async () => {
    const m = seed({ name: 'Farmacia Central', ruc: '80012345-6' });
    renderApp(`/panel/comercios/${m.id}`);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Editar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Editar comercio' });
    expect(within(dialog).getByLabelText(/^RUC/)).toHaveValue('80012345-6');
    const name = within(dialog).getByLabelText(/^Nombre/);
    await user.clear(name);
    await user.type(name, 'Farmacia del Centro');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
    expect(
      await screen.findByRole('heading', { name: 'Farmacia del Centro', level: 1 }),
    ).toBeInTheDocument();
  });

  it('suspende, reactiva y archiva con confirmación; archivado queda de solo lectura', async () => {
    const m = seed({ name: 'Farmacia Central' });
    renderApp(`/panel/comercios/${m.id}`);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Suspender' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Suspender comercio' });
    expect(within(confirm).getByRole('button', { name: 'Cancelar' })).toHaveFocus();
    await user.click(within(confirm).getByRole('button', { name: 'Suspender' }));
    expect(await screen.findByText('Suspendido')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reactivar' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Reactivar' }),
    );
    expect(await screen.findByText('Activo')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Archivar' }));
    await user.click(
      within(await screen.findByRole('alertdialog', { name: 'Archivar comercio' })).getByRole(
        'button',
        { name: 'Archivar' },
      ),
    );
    expect(await screen.findByText(/está archivado/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Agregar sucursal/ })).not.toBeInTheDocument();
    expect(
      fakeApi.requests.filter((r) => r.method === 'POST').map((r) => r.path.split('/').at(-1)),
    ).toEqual(['suspend', 'reactivate', 'archive']);
  });

  it('cancelar la confirmación no cambia nada', async () => {
    const m = seed({ name: 'Farmacia Central' });
    renderApp(`/panel/comercios/${m.id}`);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Archivar' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancelar' }),
    );
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(fakeApi.requests.some((r) => r.method === 'POST')).toBe(false);
  });

  it('agrega una sucursal con horario; los días cerrados no se envían', async () => {
    const m = seed({ name: 'Farmacia Central' });
    renderApp(`/panel/comercios/${m.id}`);
    const user = userEvent.setup();
    await user.click((await screen.findAllByRole('button', { name: 'Agregar sucursal' }))[0]!);
    const dialog = await screen.findByRole('dialog', { name: 'Nueva sucursal' });

    await user.type(within(dialog).getByLabelText(/^Nombre/), 'Casa central');
    await user.type(within(dialog).getByLabelText(/^Dirección/), 'Palma 123');
    await user.type(within(dialog).getByLabelText(/^Barrio/), 'Catedral');
    await user.type(within(dialog).getByLabelText(/^Ciudad/), 'Asunción');
    await user.click(within(dialog).getByRole('button', { name: 'Abrir el lunes' }));
    expect(within(dialog).getByLabelText('Lunes, franja 1, abre')).toHaveValue('08:00');
    await user.click(within(dialog).getByRole('button', { name: 'Agregar sucursal' }));

    expect(await screen.findByRole('heading', { name: 'Casa central' })).toBeInTheDocument();
    expect(lastRequest('POST', /\/branches$/)?.body).toMatchObject({
      name: 'Casa central',
      references: null,
      phone: null,
      openingHours: { mon: [{ from: '08:00', to: '18:00' }] },
    });
  });

  it('archiva una sucursal desde su menú', async () => {
    const m = seed({ name: 'Farmacia Central', branches: [{ name: 'Casa central' }] });
    renderApp(`/panel/comercios/${m.id}`);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Acciones de Casa central' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Archivar' }));
    await user.click(
      within(await screen.findByRole('alertdialog', { name: 'Archivar Casa central' })).getByRole(
        'button',
        { name: 'Archivar' },
      ),
    );
    expect(await screen.findByText('Sin sucursales')).toBeInTheDocument();
  });

  it('un Operador ve el detalle sin acciones', async () => {
    fakeApi.reset({ as: OPERATOR });
    const m = seed({ name: 'Farmacia Central', branches: [{ name: 'Casa central' }] });
    renderApp(`/panel/comercios/${m.id}`);
    expect(await screen.findByRole('heading', { name: 'Casa central' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Suspender' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Acciones de Casa central' }),
    ).not.toBeInTheDocument();
  });

  it('un comercio de otra empresa o inexistente: "no encontramos"', async () => {
    const other = seed({ name: 'Ajeno' }, TENANT_B);
    renderApp(`/panel/comercios/${other.id}`);
    expect(await screen.findByText('No encontramos este comercio')).toBeInTheDocument();
    expect(screen.queryByText('Ajeno')).not.toBeInTheDocument();
  });
});
