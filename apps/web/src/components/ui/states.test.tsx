import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createConnectionSource } from '@/hooks/use-connection-status';
import { ConnectionStatus } from './connection-status';
import { EmptyState, ErrorState, LoadingState } from './states';
import { StatusPill } from './status-pill';

describe('estados', () => {
  it('EmptyState muestra título, descripción y acción', () => {
    render(
      <EmptyState
        title="Sin pedidos"
        description="Creá el primero."
        action={<button>Crear</button>}
      />,
    );
    expect(screen.getByText('Sin pedidos')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crear' })).toBeInTheDocument();
  });

  it('ErrorState es una alerta y permite reintentar', async () => {
    const onRetry = vi.fn();
    render(<ErrorState onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('ErrorState sin onRetry no muestra el botón', () => {
    render(<ErrorState />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('LoadingState anuncia la carga', () => {
    render(<LoadingState label="Cargando pedidos…" />);
    expect(screen.getByRole('status')).toHaveTextContent('Cargando pedidos…');
  });

  it('StatusPill lleva el significado en texto', () => {
    render(<StatusPill tone="danger">Incidencia</StatusPill>);
    expect(screen.getByText('Incidencia')).toBeInTheDocument();
  });
});

describe('ConnectionStatus', () => {
  it('no muestra nada si está conectado y reacciona a la fuente', () => {
    const source = createConnectionSource('connected');
    render(<ConnectionStatus source={source} />);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();

    act(() => source.set('reconnecting'));
    expect(screen.getByRole('status')).toHaveTextContent('Reconectando');

    act(() => source.set('disconnected'));
    expect(screen.getByRole('status')).toHaveTextContent('Sin conexión');

    act(() => source.set('connected'));
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });
});
