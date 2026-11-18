import { createMemoryHistory } from '@tanstack/react-router';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '@/App';
import { resetToasts } from '@/components/ui/toast';
import { createAppRouter } from '@/router';

async function renderOrder(id: string) {
  const router = createAppRouter({
    history: createMemoryHistory({ initialEntries: [`/panel/prototipo/pedido/${id}`] }),
  });
  render(<App router={router} />);
  await screen.findByRole('heading', { level: 1, name: id });
}

describe('Prototipo de detalle de pedido', { timeout: 15_000 }, () => {
  afterEach(() => act(() => resetToasts()));

  it('muestra recorrido, historial con cambio hecho sin señal e incidencias', async () => {
    await renderOrder('DEMO-1043');
    expect(screen.getByRole('note', { name: 'Prototipo' })).toBeInTheDocument();
    const journey = screen.getByRole('region', { name: 'Recorrido' });
    const current = within(journey)
      .getAllByRole('listitem')
      .find((li) => li.getAttribute('aria-current') === 'step');
    expect(current).toHaveTextContent('En camino');
    expect(screen.getByText(/Hecho sin señal a las/)).toBeInTheDocument();
    expect(screen.getByText('Reasignación: pinchadura de la moto')).toBeInTheDocument();
  });

  it('solo ofrece acciones válidas para el estado', async () => {
    await renderOrder('DEMO-1043'); // EN_CAMINO
    expect(screen.queryByRole('button', { name: 'Cancelar pedido' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reasignar' })).not.toBeInTheDocument();
    expect(screen.getByText(/Ya no se puede cancelar/)).toBeInTheDocument();
  });

  it('resolver una incidencia exige contar cómo se resolvió', async () => {
    const user = userEvent.setup();
    await renderOrder('DEMO-1043');
    await user.click(screen.getByRole('button', { name: 'Resolver incidencia' }));
    const dialog = await screen.findByRole('dialog', { name: 'Resolver INC-208' });
    await user.click(within(dialog).getByRole('button', { name: 'Marcar resuelta' }));
    expect(within(dialog).getByText('Contá cómo se resolvió.')).toBeInTheDocument();
    await user.type(
      within(dialog).getByLabelText(/Cómo se resolvió/),
      'Atendió al segundo llamado.',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Marcar resuelta' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('1 incidencia abierta')).not.toBeInTheDocument();
    expect(screen.getByText('Atendió al segundo llamado.')).toBeInTheDocument();
  });

  it('cancelar pide motivo obligatorio y deja constancia en el historial', async () => {
    const user = userEvent.setup();
    await renderOrder('DEMO-1057'); // PENDIENTE_ASIGNACION
    await user.click(screen.getByRole('button', { name: 'Cancelar pedido' }));
    const dialog = await screen.findByRole('dialog', { name: 'Cancelar DEMO-1057' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar pedido' }));
    expect(await within(dialog).findByText('Elegí un motivo.')).toBeInTheDocument();
    await user.selectOptions(within(dialog).getByLabelText(/Motivo/), 'Duplicado');
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar pedido' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const history = screen.getByRole('region', { name: 'Historial' });
    expect(within(history).getByText('Duplicado')).toBeInTheDocument();
    expect(within(history).getByText('Cancelado')).toBeInTheDocument();
  });

  it('un código inexistente explica qué hacer', async () => {
    const router = createAppRouter({
      history: createMemoryHistory({ initialEntries: ['/panel/prototipo/pedido/NO-EXISTE'] }),
    });
    render(<App router={router} />);
    expect(await screen.findByText('No encontramos el pedido NO-EXISTE')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver DEMO-1043' })).toBeInTheDocument();
  });
});
