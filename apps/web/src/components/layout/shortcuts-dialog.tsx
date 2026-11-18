import { Fragment } from 'react';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Kbd } from '@/components/ui/kbd';

export const SHORTCUTS: {
  title: string;
  items: { keys: string[]; label: string; combo?: boolean }[];
}[] = [
  {
    title: 'En todo el panel',
    items: [
      { keys: ['Ctrl', 'K'], label: 'Buscar o ir a…', combo: true },
      { keys: ['?'], label: 'Ver estos atajos' },
    ],
  },
  {
    title: 'Tablero de despacho',
    items: [
      { keys: ['/'], label: 'Buscar pedido' },
      { keys: ['↑', '↓'], label: 'Pedido anterior / siguiente en la columna' },
      { keys: ['←', '→'], label: 'Columna anterior / siguiente' },
      { keys: ['Enter'], label: 'Abrir el pedido' },
      { keys: ['A'], label: 'Asignar repartidor al pedido enfocado' },
      { keys: ['X'], label: 'Seleccionar para asignación múltiple' },
      { keys: ['Esc'], label: 'Cerrar el panel o limpiar la selección' },
    ],
  },
];

export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Atajos de teclado</DialogTitle>
          <DialogDescription>
            Las teclas simples no se activan mientras escribís en un campo. En Mac, Ctrl es ⌘.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="pb-5">
          {SHORTCUTS.map((group) => (
            <section key={group.title} className="mt-2 first:mt-0">
              <h3 className="mb-1 text-[0.8125rem] font-semibold text-muted-foreground">
                {group.title}
              </h3>
              <dl className="divide-y">
                {group.items.map((s) => (
                  <div key={s.label} className="flex items-center justify-between gap-4 py-2">
                    <dt className="text-sm">{s.label}</dt>
                    <dd className="flex shrink-0 items-center gap-1">
                      {s.keys.map((k, i) => (
                        <Fragment key={k}>
                          {i > 0 && s.combo ? (
                            <span className="text-xs text-muted-foreground">+</span>
                          ) : null}
                          <Kbd>{k}</Kbd>
                        </Fragment>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
