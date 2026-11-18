import { Link } from '@tanstack/react-router';
import { ArrowRight, Bike, LayoutDashboard, Palette, Store } from 'lucide-react';
import { LogoMark } from '@/components/brand/logo';
import { OrderRail } from '@/components/ui/order-rail';

const AREAS = [
  {
    to: '/panel/',
    icon: LayoutDashboard,
    title: 'Panel de operaciones',
    text: 'Despacho, pedidos, repartidores, efectivo.',
  },
  {
    to: '/comercio',
    icon: Store,
    title: 'Portal del comercio',
    text: 'Cargar y seguir pedidos.',
  },
  {
    to: '/repartidor',
    icon: Bike,
    title: 'App del repartidor',
    text: 'Entregas del día, aun sin señal.',
  },
  {
    to: '/panel/ui',
    icon: Palette,
    title: 'Guía de UI y prototipos',
    text: 'Sistema de diseño y pantallas de ejemplo.',
  },
] as const;

export function HomePage() {
  return (
    <main
      id="contenido"
      className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center px-4 py-12"
    >
      <LogoMark className="size-10" />
      <h1 className="mt-5 font-display text-4xl font-bold leading-tight tracking-[0.01em]">
        ZESTIA DELIVERY
      </h1>
      <p className="mt-2 max-w-[48ch] text-base text-muted-foreground">
        Centro de control para empresas de delivery: cada pedido, de la tienda a la puerta.
      </p>
      <OrderRail status="EN_CAMINO" size="md" className="mt-6 max-w-sm" />
      <p className="mt-1.5 text-xs text-muted-foreground">Plataforma en construcción (R1).</p>

      <nav aria-label="Áreas" className="mt-8 divide-y rounded-lg border bg-card">
        {AREAS.map(({ to, icon: Icon, title, text }) => (
          <Link
            key={to}
            to={to}
            className="group flex items-center gap-4 px-4 py-3.5 first:rounded-t-lg last:rounded-b-lg hover:bg-subtle"
          >
            <Icon aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{title}</span>
              <span className="block text-[0.8125rem] text-muted-foreground">{text}</span>
            </span>
            <ArrowRight
              aria-hidden="true"
              className="size-4 shrink-0 text-muted-foreground transition-transform duration-(--dur-fast) group-hover:translate-x-0.5"
            />
          </Link>
        ))}
      </nav>
    </main>
  );
}
