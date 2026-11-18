import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider, THEME_STORAGE_KEY } from '@/lib/theme';
import { ThemeToggle } from './theme-toggle';

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.classList.remove('dark');
});

describe('ThemeToggle', () => {
  it('cambia a oscuro, aplica la clase y persiste', async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );
    await user.click(screen.getByRole('button', { name: /Tema/ }));
    await user.click(await screen.findByRole('menuitemradio', { name: 'Oscuro' }));

    expect(document.documentElement).toHaveClass('dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');

    await user.click(screen.getByRole('button', { name: /Tema: Oscuro/ }));
    await user.click(await screen.findByRole('menuitemradio', { name: 'Claro' }));
    expect(document.documentElement).not.toHaveClass('dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });

  it('restaura la preferencia guardada', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );
    expect(document.documentElement).toHaveClass('dark');
    expect(screen.getByRole('button', { name: 'Tema: Oscuro' })).toBeInTheDocument();
  });
});
