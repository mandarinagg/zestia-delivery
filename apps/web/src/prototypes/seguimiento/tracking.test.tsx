import { QueryClient } from '@tanstack/react-query';
import { createMemoryHistory } from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '@/App';
import { createAppRouter } from '@/router';
import { milestoneOf } from './tracking';

function renderTracking() {
  const router = createAppRouter({
    history: createMemoryHistory({ initialEntries: ['/prototipo/seguimiento'] }),
  });
  return render(<App router={router} queryClient={new QueryClient()} />);
}

describe('Prototipo de seguimiento público', () => {
  it('muestra estado, hora estimada rotulada y nombre de pila', async () => {
    renderTracking();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Tu pedido está en camino' }),
    ).toBeInTheDocument();
    expect(screen.getByText('(estimada)')).toBeInTheDocument();
    expect(screen.getByText('14:50')).toBeInTheDocument();
    expect(screen.getByText('Ramón')).toBeInTheDocument();
    expect(screen.queryByText(/Gs\./)).not.toBeInTheDocument();
    expect(screen.queryByText(/\+595/)).not.toBeInTheDocument();
  });

  it('cambia de estado de ejemplo', async () => {
    const user = userEvent.setup();
    renderTracking();
    await user.click(await screen.findByRole('radio', { name: 'Entregado' }));
    expect(
      screen.getByRole('heading', { level: 1, name: 'Tu pedido fue entregado' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('(estimada)')).not.toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Link vencido' }));
    expect(
      screen.getByRole('heading', { level: 1, name: 'Este link ya no está disponible' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('DEMO-1043')).not.toBeInTheDocument();
  });

  it('mapea los estados reales a hitos del cliente', () => {
    expect(milestoneOf('PENDIENTE_ASIGNACION')).toBe(0);
    expect(milestoneOf('ACEPTADO')).toBe(0);
    expect(milestoneOf('RETIRADO')).toBe(1);
    expect(milestoneOf('EN_CAMINO')).toBe(2);
    expect(milestoneOf('ENTREGADO')).toBe(3);
    expect(milestoneOf('NO_ENTREGADO')).toBeNull();
    expect(milestoneOf('CANCELADO')).toBeNull();
  });
});
