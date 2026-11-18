import { QueryClient } from '@tanstack/react-query';
import { createMemoryHistory } from '@tanstack/react-router';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { createAppRouter } from './router';

function renderAt(path: string) {
  const router = createAppRouter({ history: createMemoryHistory({ initialEntries: [path] }) });
  return render(<App router={router} queryClient={new QueryClient()} />);
}

describe('App', () => {
  it('renderiza la ruta de inicio', async () => {
    renderAt('/');
    expect(await screen.findByRole('heading', { name: 'ZESTIA DELIVERY' })).toBeInTheDocument();
  });

  it('muestra el panel con navegación y marca la sección activa', async () => {
    renderAt('/panel/pedidos');
    const nav = await screen.findByRole('navigation', { name: 'Principal' });
    expect(nav).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Pedidos' })).toBeInTheDocument();
    const active = screen.getAllByRole('link', { name: 'Pedidos' })[0]!;
    expect(active).toHaveAttribute('aria-current', 'page');
  });

  it('abre y cierra el menú móvil con Escape', async () => {
    const user = userEvent.setup();
    renderAt('/panel/');
    await user.click(await screen.findByRole('button', { name: 'Abrir menú' }));
    expect(screen.getByRole('dialog', { name: 'Menú de navegación' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('colapsa el menú lateral', async () => {
    const user = userEvent.setup();
    renderAt('/panel/');
    const toggle = await screen.findByRole('button', { name: 'Contraer menú lateral' });
    await user.click(toggle);
    expect(screen.getByRole('button', { name: 'Expandir menú lateral' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('renderiza la guía de UI', async () => {
    renderAt('/panel/ui');
    expect(await screen.findByRole('heading', { name: 'Guía de UI' })).toBeInTheDocument();
    expect(await screen.findByRole('region', { name: 'Pedidos de ejemplo' })).toBeInTheDocument();
  });

  it('abre la paleta con Ctrl+K y navega con el teclado', async () => {
    const user = userEvent.setup();
    renderAt('/panel/');
    await screen.findByRole('heading', { name: 'Despacho' });
    await user.keyboard('{Control>}k{/Control}');
    const palette = await screen.findByRole('dialog', { name: 'Buscar o ir a…' });
    await user.type(within(palette).getByRole('combobox'), 'guía');
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('heading', { name: 'Guía de UI' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('muestra los atajos con ?', async () => {
    const user = userEvent.setup();
    renderAt('/panel/');
    await screen.findByRole('heading', { name: 'Despacho' });
    await user.keyboard('?');
    const dialog = await screen.findByRole('dialog', { name: 'Atajos de teclado' });
    expect(within(dialog).getByText('Asignar repartidor al pedido enfocado')).toBeInTheDocument();
  });

  it('cambia la densidad desde el menú de usuario y la guarda', async () => {
    const user = userEvent.setup();
    renderAt('/panel/');
    await user.click(await screen.findByRole('button', { name: 'Menú de usuario' }));
    await user.click(await screen.findByRole('menuitemradio', { name: 'Compacta' }));
    expect(document.documentElement.dataset.density).toBe('compact');
    expect(window.localStorage.getItem('zestia.density')).toBe('compact');
  });

  it('la sección sin construir enlaza a su prototipo', async () => {
    renderAt('/panel/');
    expect(await screen.findByRole('link', { name: 'Ver el prototipo' })).toHaveAttribute(
      'href',
      '/panel/prototipo/despacho',
    );
  });

  it.each([
    ['/comercio', 'Portal del comercio'],
    ['/repartidor', 'App del repartidor'],
    ['/t/abc123', 'Seguimiento de pedido'],
  ])('renderiza el área %s', async (path, title) => {
    renderAt(path);
    expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument();
  });
});
