import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useHotkeys } from './use-hotkeys';

function Harness({ onSlash, onModK }: { onSlash: () => void; onModK: () => void }) {
  useHotkeys({ '/': onSlash, 'mod+k': onModK });
  return <input aria-label="Campo" />;
}

describe('useHotkeys', () => {
  it('dispara teclas simples fuera de los campos', async () => {
    const user = userEvent.setup();
    const onSlash = vi.fn();
    render(<Harness onSlash={onSlash} onModK={vi.fn()} />);
    await user.keyboard('/');
    expect(onSlash).toHaveBeenCalledOnce();
  });

  it('ignora teclas simples mientras se escribe, pero no las combinaciones con Ctrl', async () => {
    const user = userEvent.setup();
    const onSlash = vi.fn();
    const onModK = vi.fn();
    render(<Harness onSlash={onSlash} onModK={onModK} />);
    await user.click(screen.getByLabelText('Campo'));
    await user.keyboard('/');
    expect(onSlash).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Campo')).toHaveValue('/');
    await user.keyboard('{Control>}k{/Control}');
    expect(onModK).toHaveBeenCalledOnce();
  });
});
