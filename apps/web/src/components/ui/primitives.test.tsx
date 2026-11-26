import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { CASH_STATUSES, ORDER_STATUSES, STATUS_META } from '@/lib/order-states';
import { Button } from './button';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from './dialog';
import { CashRail, OrderRail, railLabel } from './order-rail';
import { Segmented } from './segmented';
import { CashStatusPill, OrderStatusPill } from './status-pill';
import { dismissToast, resetToasts, toast, Toaster } from './toast';

describe('estados de pedido y cobro', () => {
  it.each(ORDER_STATUSES)('OrderStatusPill muestra la etiqueta de %s', (status) => {
    const { unmount } = render(<OrderStatusPill status={status} />);
    expect(screen.getByText(STATUS_META[status].label)).toBeInTheDocument();
    unmount();
    render(<OrderStatusPill status={status} short />);
    expect(screen.getByText(STATUS_META[status].short)).toBeInTheDocument();
  });

  it('el riel describe la posición en texto', () => {
    render(<OrderRail status="EN_RETIRO" />);
    expect(
      screen.getByRole('img', { name: 'Recorrido: En retiro, paso 5 de 8' }),
    ).toBeInTheDocument();
    expect(railLabel('NO_ENTREGADO')).toBe('Recorrido: desvío a no entregado');
    expect(railLabel('CANCELADO')).toBe('Recorrido: cancelado');
  });

  it('el riel de cobro marca el paso actual', () => {
    render(<CashRail status="RENDIDO" />);
    const list = screen.getByRole('list', { name: 'Estado del cobro' });
    const current = within(list)
      .getAllByRole('listitem')
      .find((li) => li.getAttribute('aria-current') === 'step');
    expect(current).toHaveTextContent('Rendido');
  });

  it('sin cobro en efectivo no dibuja riel', () => {
    render(<CashRail status="NO_APLICA" />);
    expect(screen.getByText('Sin cobro en efectivo.')).toBeInTheDocument();
  });

  it.each(CASH_STATUSES)('CashStatusPill %s tiene texto', (status) => {
    render(<CashStatusPill status={status} />);
    expect(screen.getByText(/Sin cobro|Por cobrar|Cobrado|Rendido|Liquidado/)).toBeInTheDocument();
  });
});

describe('Segmented', () => {
  function Harness() {
    const [v, setV] = useState<'a' | 'b' | 'c'>('a');
    return (
      <Segmented
        label="Vista"
        value={v}
        onChange={setV}
        options={[
          { value: 'a', label: 'Tablero' },
          { value: 'b', label: 'Lista', count: 3 },
          { value: 'c', label: 'Mapa' },
        ]}
      />
    );
  }

  it('es un radiogroup con flechas y una sola parada de tabulación', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const group = screen.getByRole('radiogroup', { name: 'Vista' });
    const radios = within(group).getAllByRole('radio');
    expect(radios.filter((r) => r.tabIndex === 0)).toHaveLength(1);

    await user.tab();
    expect(radios[0]).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Lista 3' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Lista 3' })).toHaveFocus();
    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(screen.getByRole('radio', { name: 'Mapa' })).toBeChecked();
  });
});

describe('Dialog', () => {
  it('atrapa el foco, cierra con Escape y devuelve el foco al disparador', async () => {
    const user = userEvent.setup();
    render(
      <Dialog>
        <DialogTrigger asChild>
          <Button>Abrir</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogTitle>Cancelar DEMO-1</DialogTitle>
          <DialogDescription>Confirmá.</DialogDescription>
          <Button>Volver</Button>
          <Button>Cancelar pedido</Button>
        </DialogContent>
      </Dialog>,
    );
    const trigger = screen.getByRole('button', { name: 'Abrir' });
    await user.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Cancelar DEMO-1' });
    expect(dialog).toContainElement(document.activeElement as HTMLElement);

    for (let i = 0; i < 5; i++) {
      await user.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});

describe('toasts', () => {
  afterEach(() => {
    act(() => resetToasts());
    vi.useRealTimers();
  });

  it('anuncia éxito en la región polite y errores como alerta', () => {
    render(<Toaster />);
    act(() => {
      toast({ tone: 'success', title: 'DEMO-1 asignado' });
      toast({ tone: 'danger', title: 'No se pudo asignar' });
    });
    expect(screen.getByRole('status')).toHaveTextContent('DEMO-1 asignado');
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo asignar');
  });

  it('la acción se ejecuta y cierra el aviso', async () => {
    const user = userEvent.setup();
    const undo = vi.fn();
    render(<Toaster />);
    act(() => {
      toast({ title: 'Asignado', action: { label: 'Deshacer', onClick: undo } });
    });
    await user.click(screen.getByRole('button', { name: 'Deshacer' }));
    expect(undo).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.getByRole('status')).not.toHaveTextContent('Asignado'));
  });

  it('se cierra solo después de la duración', () => {
    vi.useFakeTimers();
    render(<Toaster />);
    act(() => {
      toast({ title: 'Guardado', duration: 1000 });
    });
    expect(screen.getByText('Guardado')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1000 + 200));
    expect(screen.queryByText('Guardado')).not.toBeInTheDocument();
  });

  it('dismissToast lo quita', () => {
    vi.useFakeTimers();
    render(<Toaster />);
    let id = 0;
    act(() => {
      id = toast({ title: 'Hola', duration: 0 });
    });
    act(() => {
      dismissToast(id);
      vi.advanceTimersByTime(200);
    });
    expect(screen.queryByText('Hola')).not.toBeInTheDocument();
  });
});
