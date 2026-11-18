import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SampleForm } from './sample-form';

describe('SampleForm', () => {
  it('muestra errores accesibles y no envía si es inválido', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<SampleForm onSubmit={onSubmit} />);
    await user.click(screen.getByRole('button', { name: 'Guardar comercio' }));

    expect(await screen.findByText('Ingresá el nombre del comercio.')).toBeInTheDocument();
    expect(screen.getByText('Elegí una zona.')).toBeInTheDocument();
    expect(screen.getByText('Tenés que confirmar los datos para continuar.')).toBeInTheDocument();
    const name = screen.getByLabelText(/Nombre del comercio/);
    expect(name).toBeInvalid();
    expect(name).toHaveAccessibleDescription('Ingresá el nombre del comercio.');
    expect(name).toHaveFocus();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('marca los obligatorios para lectores de pantalla', () => {
    render(<SampleForm />);
    expect(screen.getByLabelText(/Nombre del comercio/)).toBeRequired();
    expect(screen.getByLabelText(/Notas/)).not.toBeRequired();
  });

  it('valida el monto entero', async () => {
    const user = userEvent.setup();
    render(<SampleForm />);
    await user.type(screen.getByLabelText(/Tarifa base/), '10.5');
    await user.click(screen.getByRole('button', { name: 'Guardar comercio' }));
    expect(await screen.findByText('El monto no puede tener decimales.')).toBeInTheDocument();
  });

  it('envía valores válidos y tipados', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<SampleForm onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText(/Nombre del comercio/), 'Comercio demo');
    await user.type(screen.getByLabelText(/Teléfono/), '0981123456');
    await user.selectOptions(screen.getByLabelText(/Zona/), 'centro');
    await user.type(screen.getByLabelText(/Tarifa base/), '25000');
    await user.click(screen.getByLabelText(/Confirmo/));
    await user.click(screen.getByRole('button', { name: 'Guardar comercio' }));

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({
      name: 'Comercio demo',
      zone: 'centro',
      baseFee: 25000,
      accepted: true,
    });
  });
});
