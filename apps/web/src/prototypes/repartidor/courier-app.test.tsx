import { createMemoryHistory } from '@tanstack/react-router';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '@/App';
import { resetToasts } from '@/components/ui/toast';
import { createAppRouter } from '@/router';

function renderCourier() {
  const router = createAppRouter({
    history: createMemoryHistory({ initialEntries: ['/prototipo/repartidor'] }),
  });
  return render(<App router={router} />);
}

afterEach(() => resetToasts());

describe('Prototipo app del repartidor', () => {
  it('muestra el rótulo de prototipo, la entrega actual y el efectivo para rendir', async () => {
    renderCourier();
    expect(await screen.findByRole('heading', { name: 'Ramón Giménez' })).toBeInTheDocument();
    expect(screen.getByRole('note', { name: 'Prototipo' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /Entrega actual:\s*DEMO-1043/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/para rendir/)).toHaveTextContent('Tenés Gs. 185.000 para rendir');
  });

  it('acepta un pedido asignado', async () => {
    const user = userEvent.setup();
    renderCourier();
    await user.click(await screen.findByRole('button', { name: /DEMO-1056/ }));
    const current = screen.getByRole('article', { name: /DEMO-1056/ });
    expect(within(current).getByText('Asignado')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Aceptar' }));
    expect(
      within(screen.getByRole('article', { name: /DEMO-1056/ })).getByText('Aceptado'),
    ).toBeInTheDocument();
    expect(await screen.findByText('Pedido aceptado')).toBeInTheDocument();
  });

  it('registra una entrega con efectivo y suma al efectivo en mano', async () => {
    const user = userEvent.setup();
    renderCourier();
    await user.click(await screen.findByRole('button', { name: 'Entregué' }));
    const sheet = await screen.findByRole('dialog', { name: 'Registrar entrega' });
    await user.click(within(sheet).getByRole('button', { name: 'Cobré Gs. 85.000' }));

    expect(
      screen.queryByRole('heading', { name: /Entrega actual:\s*DEMO-1043/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/para rendir/)).toHaveTextContent('Tenés Gs. 270.000 para rendir');
    expect(await screen.findByText('Entrega registrada')).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: /Hechas/ }));
    const done = screen.getByRole('region', { name: 'Entregas hechas' });
    expect(within(done).getByText('DEMO-1043')).toBeInTheDocument();
  });

  it('valida el monto distinto al esperado', async () => {
    const user = userEvent.setup();
    renderCourier();
    await user.click(await screen.findByRole('button', { name: 'Entregué' }));
    const sheet = await screen.findByRole('dialog', { name: 'Registrar entrega' });
    await user.click(within(sheet).getByRole('button', { name: 'Cobré otro monto' }));
    await user.click(within(sheet).getByRole('button', { name: 'Registrar con este monto' }));
    expect(within(sheet).getByRole('alert')).toHaveTextContent(/sin decimales/);
  });

  it('sin señal encola los cambios y los muestra', async () => {
    const user = userEvent.setup();
    renderCourier();
    await user.click(await screen.findByRole('switch', { name: /Simular sin señal/ }));
    expect(
      screen.getByText('Sin señal. Guardamos tus cambios y los enviamos cuando vuelva.'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Entregué' }));
    const sheet = await screen.findByRole('dialog', { name: 'Registrar entrega' });
    await user.click(within(sheet).getByRole('button', { name: 'Cobré Gs. 85.000' }));
    await user.click(screen.getByRole('button', { name: 'Salgo a entregar' }));

    const queueButton = screen.getByRole('button', { name: '2 cambios sin enviar' });
    expect(screen.getAllByText('Pendiente de envío').length).toBeGreaterThan(0);
    await user.click(queueButton);
    const queue = await screen.findByRole('dialog', { name: 'Cambios sin enviar' });
    expect(within(queue).getAllByRole('listitem')).toHaveLength(2);
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('switch', { name: /Simular sin señal/ }));
    expect(await screen.findByText('Cambios enviados', {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sin enviar/ })).not.toBeInTheDocument();
  });

  it('rechazar pide un motivo', async () => {
    const user = userEvent.setup();
    renderCourier();
    await user.click(await screen.findByRole('button', { name: /DEMO-1056/ }));
    await user.click(screen.getByRole('button', { name: 'Rechazar' }));
    const sheet = await screen.findByRole('dialog', { name: 'Rechazar pedido' });
    const confirm = within(sheet).getByRole('button', { name: 'Rechazar pedido' });
    expect(confirm).toBeDisabled();
    await user.click(within(sheet).getByRole('radio', { name: 'Problema con la moto' }));
    await user.click(confirm);
    expect(screen.queryByText('DEMO-1056')).not.toBeInTheDocument();
  });
});
