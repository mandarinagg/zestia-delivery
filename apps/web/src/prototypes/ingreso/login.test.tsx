import { QueryClient } from '@tanstack/react-query';
import { createMemoryHistory } from '@tanstack/react-router';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '@/App';
import { resetToasts } from '@/components/ui/toast';
import { createAppRouter } from '@/router';
import { DEMO_WRONG_PASSWORD } from './login';
import { tokenFromHash } from './reset-password';

function renderAt(path: string) {
  const router = createAppRouter({ history: createMemoryHistory({ initialEntries: [path] }) });
  render(<App router={router} queryClient={new QueryClient()} />);
  return router;
}
const renderLogin = () => renderAt('/prototipo/ingreso');

afterEach(() => resetToasts());

describe('Prototipo de ingreso', () => {
  it('muestra errores accesibles si se envía vacío', async () => {
    const user = userEvent.setup();
    renderLogin();
    await user.click(await screen.findByRole('button', { name: 'Ingresar' }));
    expect(await screen.findByText('Ingresá tu correo.')).toBeInTheDocument();
    expect(screen.getByText('Ingresá tu contraseña.')).toBeInTheDocument();
    const email = screen.getByLabelText(/Correo/);
    expect(email).toBeInvalid();
    expect(email).toHaveFocus();
  });

  it('valida el formato del correo', async () => {
    const user = userEvent.setup();
    renderLogin();
    await user.type(await screen.findByLabelText(/Correo/), 'sin-arroba');
    await user.click(screen.getByRole('button', { name: 'Ingresar' }));
    expect(await screen.findByText(/Revisá el correo/)).toBeInTheDocument();
  });

  it('muestra y oculta la contraseña con aria-pressed', async () => {
    const user = userEvent.setup();
    renderLogin();
    const toggle = await screen.findByRole('button', { name: 'Mostrar contraseña' });
    const password = screen.getByLabelText(/^Contraseña/);
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(password).toHaveAttribute('type', 'password');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(password).toHaveAttribute('type', 'text');
  });

  it('con credenciales incorrectas muestra un error genérico y enfocado', async () => {
    const user = userEvent.setup();
    renderLogin();
    await user.type(await screen.findByLabelText(/Correo/), 'demo@ejemplo.com.py');
    await user.type(screen.getByLabelText(/^Contraseña/), DEMO_WRONG_PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Ingresar' }));
    // El Toaster también expone role=alert (vacío): buscamos por texto y subimos al contenedor.
    const alert = (await screen.findByText('El correo o la contraseña no coinciden.')).closest(
      '[role="alert"]',
    );
    expect(alert).toHaveFocus();
  });

  it('con datos válidos pasa al selector de empresa con la activa preseleccionada', async () => {
    const user = userEvent.setup();
    const router = renderLogin();
    await user.type(await screen.findByLabelText(/Correo/), 'demo@ejemplo.com.py');
    await user.type(screen.getByLabelText(/^Contraseña/), 'secreta-de-ejemplo');
    await user.click(screen.getByRole('button', { name: 'Ingresar' }));
    expect(
      await screen.findByRole('heading', { name: '¿Con qué empresa trabajás hoy?' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Envíos Ejemplo S\.A\./ })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: /Rápido Demo/ }));
    await user.click(screen.getByRole('button', { name: 'Entrar a Rápido Demo' }));
    expect(await screen.findByText('Entraste a Rápido Demo')).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.pathname).toBe('/prototipo/repartidor'));
  });
});

describe('Prototipos de recuperación de contraseña', () => {
  it('pedir el enlace confirma sin revelar si la cuenta existe', async () => {
    const user = userEvent.setup();
    renderAt('/prototipo/olvide-contrasena');
    await user.type(await screen.findByLabelText(/Correo/), 'alguien@ejemplo.com.py');
    await user.click(screen.getByRole('button', { name: 'Enviar enlace' }));
    const status = (await screen.findByText(/Si hay una cuenta con/)).closest('[role="status"]');
    expect(status).toHaveTextContent('alguien@ejemplo.com.py');
    expect(status).toHaveFocus();
  });

  it('lee el token de location.hash y lo saca de la URL', async () => {
    const router = renderAt('/prototipo/restablecer-contrasena#token=demo-enlace-valido');
    expect(
      await screen.findByRole('heading', { name: 'Creá tu contraseña nueva' }),
    ).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.hash).toBe(''));
  });

  it('sin token o con token vencido ofrece pedir un enlace nuevo', async () => {
    renderAt('/prototipo/restablecer-contrasena');
    expect(await screen.findByRole('heading', { name: 'Este enlace ya no sirve' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Pedir un enlace nuevo' })).toBeInTheDocument();
  });

  it('valida largo y coincidencia, y confirma el cambio', async () => {
    const user = userEvent.setup();
    renderAt('/prototipo/restablecer-contrasena#token=demo-enlace-valido');
    const nueva = await screen.findByLabelText(/^Contraseña nueva/);
    await user.type(nueva, 'corta');
    await user.type(screen.getByLabelText(/^Repetir contraseña/), 'otra');
    await user.click(screen.getByRole('button', { name: 'Guardar contraseña' }));
    expect(await screen.findByText('Usá al menos 12 caracteres.')).toBeInTheDocument();
    expect(screen.getByText('Las contraseñas no coinciden.')).toBeInTheDocument();
    expect(nueva).toHaveAccessibleDescription(/Al menos 12 caracteres/);

    await user.clear(nueva);
    await user.type(nueva, 'una frase larga');
    const repetir = screen.getByLabelText(/^Repetir contraseña/);
    await user.clear(repetir);
    await user.type(repetir, 'una frase larga');
    await user.click(screen.getByRole('button', { name: 'Guardar contraseña' }));
    expect(
      await screen.findByRole('heading', { name: 'Listo, ya tenés contraseña nueva' }),
    ).toBeInTheDocument();
  });

  it('tokenFromHash acepta el fragmento con o sin #', () => {
    expect(tokenFromHash('#token=abc')).toBe('abc');
    expect(tokenFromHash('token=abc&x=1')).toBe('abc');
    expect(tokenFromHash('')).toBeNull();
    expect(tokenFromHash('#token=')).toBeNull();
  });
});
