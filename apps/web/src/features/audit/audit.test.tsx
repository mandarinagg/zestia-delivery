import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AuditLogEntry } from '@zestia/contracts';
import { OPERATOR, OWNER, TENANT_A, TENANT_B, type FakeUser, fakeApi } from '@/test/fake-api';
import { renderApp } from '@/test/render-app';
import {
  describeAction,
  describeActor,
  describeMetadata,
  entityLink,
  formatAuditValue,
} from './audit-format';

const MERCHANT_ID = '0192f0c4-4000-7000-8000-000000000001';
const BRANCH_ID = '0192f0c4-4000-7000-8000-000000000002';
const MEMBERSHIP_ID = '0192f0c4-4000-7000-8000-000000000003';

const ana = { type: 'USER' as const, id: OWNER.id, name: OWNER.name };
const olga = { type: 'USER' as const, id: OPERATOR.id, name: OPERATOR.name };

/** Tres días de actividad en la empresa A y un evento de la empresa B (no se tiene que ver). */
function seedActivity() {
  fakeApi.audit.seed(TENANT_A, {
    action: 'merchants.created',
    occurredAt: '2026-11-17T13:00:00.000Z',
    actor: ana,
    entity: { type: 'merchant', id: MERCHANT_ID },
    changes: {
      name: { from: null, to: 'La Esquina' },
      status: { from: null, to: 'ACTIVE' },
      phone: { redacted: true },
    },
    correlationId: 'req-123',
  });
  fakeApi.audit.seed(TENANT_A, {
    action: 'users.role_changed',
    occurredAt: '2026-11-18T14:00:00.000Z',
    actor: ana,
    entity: { type: 'membership', id: MEMBERSHIP_ID },
    changes: { role: { from: 'OPERATOR', to: 'SUPERVISOR' } },
    metadata: { userId: OPERATOR.id },
  });
  fakeApi.audit.seed(TENANT_A, {
    action: 'merchants.suspended',
    occurredAt: '2026-11-18T15:00:00.000Z',
    actor: olga,
    entity: { type: 'merchant', id: MERCHANT_ID },
    changes: { status: { from: 'ACTIVE', to: 'SUSPENDED' } },
  });
  fakeApi.audit.seed(TENANT_A, {
    action: 'zones.created',
    occurredAt: '2026-11-19T12:00:00.000Z',
  });
  fakeApi.audit.seed(TENANT_B, {
    action: 'merchants.archived',
    occurredAt: '2026-11-19T13:00:00.000Z',
    actor: { type: 'USER', id: OPERATOR.id, name: 'Zoe Otra' },
  });
}

/** Días mostrados con las frases de cada evento, en el orden de la pantalla. */
async function activity(): Promise<{ day: string; lines: string[] }[]> {
  const days = await screen.findAllByRole('region', { name: /^Actividad del/ });
  return days.map((day) => ({
    day: within(day).getByRole('heading').textContent ?? '',
    lines: within(day)
      .getAllByRole('listitem')
      .map((li) => li.querySelector('p')?.textContent ?? ''),
  }));
}

/** Evento por su frase. */
async function entry(text: string) {
  const days = await screen.findAllByRole('region', { name: /^Actividad del/ });
  const items = days.flatMap((d) => within(d).getAllByRole('listitem'));
  const found = items.find((li) => li.querySelector('p')?.textContent?.includes(text));
  if (!found) throw new Error(`No está el evento "${text}"`);
  return found;
}

const auditRequests = () =>
  fakeApi.requests.filter((r) => r.method === 'GET' && r.path === '/api/v1/audit-logs');
const lastQuery = () => auditRequests().at(-1)!.query;

/** Sesión de una persona Administradora de la empresa A. */
function signInAsAdmin(): FakeUser {
  const admin: FakeUser = {
    id: '0192f0c4-0000-7000-8000-0000000000ad',
    name: 'Adriana Admin',
    email: 'adriana@zestia.test',
    password: 'contraseña-de-adriana',
    memberships: [{ ...OWNER.memberships[0]!, role: 'ADMIN' }],
  };
  fakeApi.users.push(admin);
  fakeApi.session = { userId: admin.id, activeTenantId: TENANT_A };
  return admin;
}

describe('textos de la auditoría', () => {
  it('frase por acción, con salida por defecto para acciones nuevas', () => {
    expect(describeAction('merchants.suspended')).toBe('suspendió un comercio');
    expect(describeAction('users.invited')).toBe('invitó a una persona');
    expect(describeAction('zones.created')).toBe('registró «zones.created»');
  });

  it('actor: persona de la empresa, ex persona, sistema o sin sesión', () => {
    expect(describeActor(ana)).toEqual({ label: 'Ana Propietaria', known: true });
    expect(describeActor({ type: 'USER', id: OWNER.id, name: null })).toEqual({
      label: 'Una persona sin acceso a la empresa',
      known: false,
    });
    expect(describeActor({ type: 'SYSTEM', id: null, name: null }).label).toBe('El sistema');
    expect(describeActor({ type: 'ANONYMOUS', id: null, name: null }).label).toBe(
      'Alguien sin sesión',
    );
  });

  it('valores: roles, estados según la entidad, fechas en la zona del tenant y horarios', () => {
    expect(formatAuditValue('role', 'OWNER', 'membership')).toBe('Propietario/a');
    expect(formatAuditValue('status', 'SUSPENDED', 'merchant')).toBe('Suspendido');
    expect(formatAuditValue('status', 'DISABLED', 'membership')).toBe('Deshabilitado');
    expect(formatAuditValue('deletedAt', '2026-11-18T15:30:00.000Z', 'merchant')).toBe(
      '18/11/2026 12:30',
    );
    expect(formatAuditValue('name', null, 'merchant')).toBe('—');
    expect(formatAuditValue('name', 'La Esquina', 'merchant')).toBe('La Esquina');
    expect(
      formatAuditValue(
        'openingHours',
        JSON.stringify({ mon: [{ from: '08:00', to: '12:00' }], sat: [] }),
        'merchant_branch',
      ),
    ).toBe('Lunes 08:00–12:00');
    expect(formatAuditValue('openingHours', '{}', 'merchant_branch')).toBe(
      'Cerrado todos los días',
    );
  });

  it('metadata legible, sin identificadores internos', () => {
    expect(
      describeMetadata({ reason: 'SUPERSEDED', userId: OWNER.id, accountCreated: true }),
    ).toEqual([
      { label: 'Motivo', value: 'La reemplazó una invitación nueva al mismo correo' },
      { label: 'Cuenta', value: 'Se creó una cuenta nueva' },
    ]);
  });

  it('enlace al comercio, también desde una sucursal', () => {
    const base: AuditLogEntry = {
      id: '0192f0c4-3000-7000-8000-000000000999',
      occurredAt: '2026-11-18T15:00:00.000Z',
      action: 'merchants.branch_created',
      actor: ana,
      entity: { type: 'merchant_branch', id: BRANCH_ID },
      changes: null,
      metadata: { merchantId: MERCHANT_ID },
      correlationId: null,
    };
    expect(entityLink(base)?.merchantId).toBe(MERCHANT_ID);
    expect(entityLink({ ...base, entity: { type: 'membership', id: MEMBERSHIP_ID } })).toBeNull();
  });
});

describe('Auditoría: acceso', () => {
  it('Propietario: pestaña en Configuración y solo la actividad de su empresa, por día', async () => {
    seedActivity();
    const { router } = renderApp('/panel/configuracion/usuarios');

    const tabs = await screen.findByRole('navigation', { name: 'Configuración' });
    await userEvent.click(within(tabs).getByRole('link', { name: 'Auditoría' }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/panel/configuracion/auditoria'),
    );
    expect(within(tabs).getByRole('link', { name: 'Auditoría' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    expect(await activity()).toEqual([
      { day: '19/11/2026', lines: ['El sistema registró «zones.created»'] },
      {
        day: '18/11/2026',
        lines: [
          'Olga Operadora suspendió un comercio',
          'Ana Propietaria cambió el rol de un usuario',
        ],
      },
      { day: '17/11/2026', lines: ['Ana Propietaria creó un comercio'] },
    ]);
    expect(screen.queryByText(/Zoe Otra/)).not.toBeInTheDocument();
    expect([...lastQuery().keys()]).toEqual([]);
  });

  it('Administrador/a también la ve', async () => {
    signInAsAdmin();
    seedActivity();
    renderApp('/panel/configuracion/auditoria');
    expect(await entry('creó un comercio')).toBeInTheDocument();
  });

  it('Operador/a no ve Configuración y la URL lo devuelve al inicio del panel', async () => {
    fakeApi.reset({ as: OPERATOR });
    const { router } = renderApp('/panel/configuracion/auditoria');
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/panel\/?$/));
    expect(screen.queryByRole('link', { name: 'Configuración' })).not.toBeInTheDocument();
    expect(auditRequests()).toHaveLength(0);
  });
});

describe('Auditoría: detalle', () => {
  it('cambios campo por campo, dato protegido, enlace al comercio y referencia', async () => {
    seedActivity();
    renderApp('/panel/configuracion/auditoria');

    const created = await entry('creó un comercio');
    const toggle = within(created).getByRole('button', { name: /Detalle/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    const table = within(created).getByRole('table', { name: 'Cambios' });
    const rows = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((r) => [...r.children].map((c) => c.textContent));
    expect(rows).toEqual([
      ['Nombre', '—', 'La Esquina'],
      ['Estado', '—', 'Activo'],
      ['Teléfono', 'Dato protegido: cambió, pero el valor no se guarda.'],
    ]);
    expect(within(created).getByText('Comercio')).toBeInTheDocument();
    expect(within(created).getByText('req-123')).toBeInTheDocument();
    expect(within(created).getByRole('link', { name: 'Ver comercio' })).toHaveAttribute(
      'href',
      `/panel/comercios/${MERCHANT_ID}`,
    );

    await userEvent.click(toggle);
    expect(within(created).queryByRole('table')).not.toBeInTheDocument();
  });

  it('los roles se leen traducidos', async () => {
    seedActivity();
    renderApp('/panel/configuracion/auditoria');
    const changed = await entry('cambió el rol');
    await userEvent.click(within(changed).getByRole('button', { name: /Detalle/ }));
    const cells = within(within(changed).getByRole('table')).getAllByRole('cell');
    expect(cells.map((c) => c.textContent)).toEqual(['Operador/a', 'Supervisor/a']);
  });
});

describe('Auditoría: filtros', () => {
  it('por área: manda el prefijo de acción', async () => {
    seedActivity();
    renderApp('/panel/configuracion/auditoria');
    await entry('creó un comercio');

    await userEvent.click(screen.getByRole('radio', { name: 'Comercios' }));
    await waitFor(() => expect(lastQuery().get('action')).toBe('merchants'));
    await waitFor(async () =>
      expect((await activity()).flatMap((d) => d.lines)).toEqual([
        'Olga Operadora suspendió un comercio',
        'Ana Propietaria creó un comercio',
      ]),
    );
  });

  it('por fechas: días completos en la zona del tenant ("Hasta" incluye el día)', async () => {
    seedActivity();
    renderApp('/panel/configuracion/auditoria');
    await entry('creó un comercio');

    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-11-18' } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-11-18' } });
    await waitFor(() => {
      expect(lastQuery().get('from')).toBe('2026-11-18T03:00:00.000Z');
      expect(lastQuery().get('to')).toBe('2026-11-19T03:00:00.000Z');
    });
    await waitFor(async () => expect((await activity()).map((d) => d.day)).toEqual(['18/11/2026']));

    await userEvent.click(screen.getByRole('button', { name: 'Quitar fechas' }));
    await waitFor(() => expect(lastQuery().has('from')).toBe(false));
  });

  it('un rango al revés avisa y no consulta', async () => {
    seedActivity();
    renderApp('/panel/configuracion/auditoria');
    await entry('creó un comercio');
    const before = auditRequests().length;

    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-11-18' } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-11-17' } });
    expect(await screen.findByText(/igual o posterior a "Desde"/)).toBeInTheDocument();
    expect(screen.getByLabelText('Hasta')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryAllByRole('region', { name: /^Actividad del/ })).toHaveLength(0);
    // Solo la consulta de "Desde" sola; con el rango inválido no hay otra.
    expect(auditRequests().length).toBeLessThanOrEqual(before + 1);
    expect(auditRequests().some((r) => r.query.get('to') === '2026-11-18T03:00:00.000Z')).toBe(
      false,
    );
  });

  it('por persona: clic en el nombre y chip para quitarlo', async () => {
    seedActivity();
    renderApp('/panel/configuracion/auditoria');

    const suspended = await entry('suspendió un comercio');
    await userEvent.click(
      within(suspended).getByRole('button', { name: 'Olga Operadora: ver solo sus acciones' }),
    );
    await waitFor(() => expect(lastQuery().get('actorId')).toBe(OPERATOR.id));
    expect(screen.getByText('Solo acciones de Olga Operadora')).toBeInTheDocument();
    await waitFor(async () =>
      expect((await activity()).flatMap((d) => d.lines)).toEqual([
        'Olga Operadora suspendió un comercio',
      ]),
    );

    await userEvent.click(screen.getByRole('button', { name: /Quitar el filtro/ }));
    await waitFor(() => expect(lastQuery().has('actorId')).toBe(false));
    expect(screen.queryByText(/Solo acciones de/)).not.toBeInTheDocument();
  });

  it('el sistema y las personas sin acceso no se pueden elegir como filtro', async () => {
    seedActivity();
    renderApp('/panel/configuracion/auditoria');
    const system = await entry('zones.created');
    expect(
      within(system)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Detalle']);
  });
});

describe('Auditoría: estados', () => {
  it('"Cargar más" sigue con el cursor', async () => {
    for (let i = 0; i < 55; i++) {
      fakeApi.audit.seed(TENANT_A, {
        action: 'merchants.updated',
        occurredAt: '2026-11-18T15:00:00.000Z',
        actor: ana,
      });
    }
    renderApp('/panel/configuracion/auditoria');
    await waitFor(async () => expect((await activity())[0]!.lines).toHaveLength(50));

    await userEvent.click(screen.getByRole('button', { name: 'Cargar más' }));
    await waitFor(async () => expect((await activity())[0]!.lines).toHaveLength(55));
    expect(lastQuery().get('cursor')).toMatch(/^0192f0c4-3000-/);
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();
  });

  it('vacío: sin actividad y sin resultados para un filtro', async () => {
    renderApp('/panel/configuracion/auditoria');
    expect(await screen.findByText('Todavía no hay actividad')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'Usuarios' }));
    expect(await screen.findByText('No hay actividad con estos filtros')).toBeInTheDocument();
  });

  it('error con reintento', async () => {
    seedActivity();
    fakeApi.audit.failures = 2; // la app reintenta una vez los 5xx
    renderApp('/panel/configuracion/auditoria');
    expect(await screen.findByText('No pudimos traer la auditoría.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Reintentar/ }));
    expect(await entry('creó un comercio')).toBeInTheDocument();
  });
});
