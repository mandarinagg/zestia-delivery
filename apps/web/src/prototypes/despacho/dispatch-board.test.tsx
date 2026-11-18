import { createMemoryHistory } from '@tanstack/react-router';
import { act, configure, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '@/App';
import { resetToasts } from '@/components/ui/toast';
import { createAppRouter } from '@/router';

async function renderBoard() {
  const router = createAppRouter({
    history: createMemoryHistory({ initialEntries: ['/panel/prototipo/despacho'] }),
  });
  render(<App router={router} />);
  await screen.findByRole('heading', { name: 'Despacho' });
}

const column = (name: RegExp) => screen.getByRole('region', { name });
const card = (id: string) => screen.getByRole('button', { name: id });

// El tablero tiene ~20 tarjetas: las consultas por rol en jsdom son lentas.
configure({ asyncUtilTimeout: 4000 });

describe('Prototipo de despacho', { timeout: 20_000 }, () => {
  afterEach(() => act(() => resetToasts()));

  it('se rotula como prototipo y agrupa los pedidos por fase', async () => {
    await renderBoard();
    expect(await screen.findByRole('heading', { name: 'Despacho' })).toBeInTheDocument();
    expect(screen.getByRole('note', { name: 'Prototipo' })).toBeInTheDocument();
    expect(column(/^Por asignar/)).toContainElement(card('DEMO-1057'));
    expect(column(/^En camino/)).toContainElement(card('DEMO-1043'));
  });

  it('asigna un repartidor en dos clics, mueve la tarjeta y avisa con deshacer', async () => {
    const user = userEvent.setup();
    await renderBoard();
    await user.click(screen.getByRole('button', { name: 'Asignar DEMO-1057' }));
    await user.click(await screen.findByRole('option', { name: /Lucía Benítez/ }));

    expect(column(/^Asignados/)).toContainElement(card('DEMO-1057'));
    expect(column(/^Por asignar/)).not.toContainElement(card('DEMO-1057'));
    const status = screen.getAllByRole('status').find((s) => s.textContent?.includes('asignado a'));
    expect(status).toHaveTextContent('DEMO-1057 asignado a Lucía B.');

    await user.click(screen.getByRole('button', { name: 'Deshacer' }));
    expect(column(/^Por asignar/)).toContainElement(card('DEMO-1057'));
  });

  it('no deja elegir repartidores fuera de turno', async () => {
    const user = userEvent.setup();
    await renderBoard();
    await user.click(screen.getByRole('button', { name: 'Asignar DEMO-1057' }));
    expect(await screen.findByRole('option', { name: /Fátima Cáceres/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('se recorre con el teclado y asigna con la tecla A', async () => {
    const user = userEvent.setup();
    await renderBoard();
    await screen.findByRole('heading', { name: 'Despacho' });
    const first = document.querySelector<HTMLElement>('article[data-order-id="DEMO-1052"]')!;
    act(() => first.focus());
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toHaveAttribute('data-order-id', 'DEMO-1055');
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement?.closest('section')).toBe(column(/^Asignados/));
    await user.keyboard('{ArrowLeft}a');
    expect(await screen.findByRole('option', { name: /Lucía Benítez/ })).toBeInTheDocument();
  });

  it('selecciona varios y los asigna juntos', async () => {
    const user = userEvent.setup();
    await renderBoard();
    await user.click(await screen.findByRole('checkbox', { name: 'Seleccionar DEMO-1057' }));
    await user.click(screen.getByRole('checkbox', { name: 'Seleccionar DEMO-1054' }));
    expect(screen.getByText('2 pedidos seleccionados')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Asignar a un repartidor' }));
    await user.click(await screen.findByRole('option', { name: /Nilda Ramírez/ }));
    const assigned = column(/^Asignados/);
    expect(assigned).toContainElement(card('DEMO-1057'));
    expect(assigned).toContainElement(card('DEMO-1054'));
    expect(screen.queryByText('2 pedidos seleccionados')).not.toBeInTheDocument();
  });

  it('filtra demorados desde la señal', async () => {
    const user = userEvent.setup();
    await renderBoard();
    const late = await screen.findByRole('button', { name: /demorados/ });
    await user.click(late);
    expect(late).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: 'DEMO-1057' })).not.toBeInTheDocument();
    expect(card('DEMO-1052')).toBeInTheDocument();
  });

  it('anuncia en forma educada los pedidos que llegan', async () => {
    const user = userEvent.setup();
    await renderBoard();
    await user.click(await screen.findByRole('button', { name: 'Simular' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Llega un pedido nuevo' }));
    expect(column(/^Por asignar/)).toContainElement(card('DEMO-1059'));
    const live = screen
      .getAllByRole('status')
      .find((s) => s.getAttribute('aria-live') === 'polite' && s.textContent?.includes('Nuevo'));
    expect(live).toHaveTextContent('Nuevo pedido DEMO-1059 de Florería Ficticia, a Villa Morra.');
  });

  it('abre la vista rápida y resuelve la incidencia', async () => {
    const user = userEvent.setup();
    await renderBoard();
    await user.click(await screen.findByRole('button', { name: 'DEMO-1043' }));
    const sheet = await screen.findByRole('dialog', { name: 'DEMO-1043' });
    expect(within(sheet).getByText('Incidencia abierta: Sin contacto')).toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: 'Marcar resuelta' }));
    expect(within(sheet).queryByText('Incidencia abierta: Sin contacto')).not.toBeInTheDocument();
  });
});
