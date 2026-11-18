import { useNavigate } from '@tanstack/react-router';
import { Command } from 'cmdk';
import { Contrast, FlaskConical, Keyboard, Palette, Rows3, Search } from 'lucide-react';
import type { ReactNode } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Kbd } from '@/components/ui/kbd';
import { useTheme } from '@/lib/theme';
import { PANEL_NAV, PROTOTYPES } from './nav';

const itemClass =
  'flex min-h-10 cursor-default select-none items-center gap-3 rounded-sm px-2.5 text-sm outline-none data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground';
const groupClass =
  '[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-muted-foreground';

function Item({
  children,
  onSelect,
  keywords,
}: {
  children: ReactNode;
  onSelect: () => void;
  keywords?: string[];
}) {
  return (
    <Command.Item className={itemClass} onSelect={onSelect} keywords={keywords}>
      {children}
    </Command.Item>
  );
}

/**
 * Paleta de comandos (Ctrl/⌘ K): ir a cualquier sección o prototipo y cambiar preferencias
 * sin soltar el teclado. Cuando exista la API, también buscará pedidos por código.
 */
export function CommandMenu({
  open,
  onOpenChange,
  onShowShortcuts,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onShowShortcuts: () => void;
}) {
  const navigate = useNavigate();
  const { setPreference, resolved, density, setDensity } = useTheme();

  function run(fn: () => void) {
    onOpenChange(false);
    fn();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideClose className="top-[12vh] sm:max-w-xl sm:self-start">
        <DialogTitle className="sr-only">Buscar o ir a…</DialogTitle>
        <DialogDescription className="sr-only">
          Escribí para filtrar. Flechas para moverte, Enter para elegir, Escape para cerrar.
        </DialogDescription>
        <Command label="Comandos" loop className="flex min-h-0 flex-col">
          <div className="flex items-center gap-2 border-b px-3">
            <Search aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            <Command.Input
              autoFocus
              placeholder="Buscar sección, prototipo o acción…"
              className="h-12 w-full bg-transparent text-[0.9375rem] outline-none placeholder:text-muted-foreground"
            />
            <Kbd>Esc</Kbd>
          </div>
          <Command.List className="max-h-[min(60vh,26rem)] overflow-y-auto p-1.5 scrollbar-thin">
            <Command.Empty className="px-3 py-8 text-center text-sm text-muted-foreground">
              Nada coincide. Probá con otra palabra.
            </Command.Empty>
            <Command.Group heading="Ir a" className={groupClass}>
              {PANEL_NAV.map(({ to, label, icon: Icon }) => (
                <Item key={to} onSelect={() => run(() => void navigate({ to }))}>
                  <Icon aria-hidden="true" />
                  {label}
                </Item>
              ))}
              <Item onSelect={() => run(() => void navigate({ to: '/panel/ui' }))}>
                <Palette aria-hidden="true" />
                Guía de UI
              </Item>
            </Command.Group>
            <Command.Group heading="Prototipos" className={groupClass}>
              {PROTOTYPES.map((p) => (
                <Item
                  key={p.to}
                  keywords={['prototipo', p.description]}
                  onSelect={() => run(() => void navigate({ href: 'href' in p ? p.href : p.to }))}
                >
                  <FlaskConical aria-hidden="true" />
                  <span className="flex-1">{p.label}</span>
                  <span className="truncate text-xs text-muted-foreground">Prototipo</span>
                </Item>
              ))}
            </Command.Group>
            <Command.Group heading="Preferencias" className={groupClass}>
              <Item
                keywords={['tema', 'oscuro', 'claro']}
                onSelect={() => run(() => setPreference(resolved === 'dark' ? 'light' : 'dark'))}
              >
                <Contrast aria-hidden="true" />
                {resolved === 'dark' ? 'Usar tema claro' : 'Usar tema oscuro'}
              </Item>
              <Item
                keywords={['densidad', 'compacta', 'cómoda', 'filas']}
                onSelect={() =>
                  run(() => setDensity(density === 'compact' ? 'comfortable' : 'compact'))
                }
              >
                <Rows3 aria-hidden="true" />
                {density === 'compact' ? 'Densidad cómoda' : 'Densidad compacta'}
              </Item>
              <Item keywords={['atajos', 'teclado']} onSelect={() => run(onShowShortcuts)}>
                <Keyboard aria-hidden="true" />
                Ver atajos de teclado
              </Item>
            </Command.Group>
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
