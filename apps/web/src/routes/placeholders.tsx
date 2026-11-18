import { Link, useParams } from '@tanstack/react-router';
import { Construction, FlaskConical } from 'lucide-react';
import { LogoMark, Wordmark } from '@/components/brand/logo';
import { PageHeader } from '@/components/layout/page-header';
import { buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/states';

export function SectionPlaceholder({
  title,
  description,
  prototype,
}: {
  title: string;
  description: string;
  prototype?: string | null;
}) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <div className="rounded-lg border border-dashed border-input bg-card">
        <EmptyState
          icon={<Construction className="size-5" />}
          title="Esta sección todavía no está disponible"
          description="Se construye en un release posterior."
          action={
            prototype ? (
              <Link to={prototype} className={buttonVariants({ variant: 'outline' })}>
                <FlaskConical aria-hidden="true" />
                Ver el prototipo
              </Link>
            ) : undefined
          }
        />
      </div>
    </>
  );
}

function AreaShell({
  title,
  description,
  prototype,
}: {
  title: string;
  description: string;
  prototype?: string;
}) {
  return (
    <main
      id="contenido"
      className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-5 px-4 py-10"
    >
      <div className="flex items-center gap-2.5">
        <LogoMark />
        <Wordmark />
      </div>
      <h1 className="font-display text-[1.75rem] font-semibold leading-8">{title}</h1>
      <div className="rounded-lg border border-dashed border-input bg-card">
        <EmptyState
          icon={<Construction className="size-5" />}
          title="Esta área todavía no está disponible"
          description={description}
          action={
            prototype ? (
              <Link to={prototype} className={buttonVariants({ variant: 'outline' })}>
                <FlaskConical aria-hidden="true" />
                Ver el prototipo
              </Link>
            ) : undefined
          }
        />
      </div>
    </main>
  );
}

export const ComercioArea = () => (
  <AreaShell
    title="Portal del comercio"
    description="Acá el comercio va a cargar y seguir sus pedidos."
  />
);

export const RepartidorArea = () => (
  <AreaShell
    title="App del repartidor"
    description="Acá el repartidor va a ver y gestionar sus entregas."
    prototype="/prototipo/repartidor"
  />
);

export function TrackingArea() {
  const { token } = useParams({ from: '/t/$token' });
  return (
    <AreaShell
      title="Seguimiento de pedido"
      description={`Acá el cliente va a ver el estado de su pedido. Código: ${token.slice(0, 4)}…`}
      prototype="/prototipo/seguimiento"
    />
  );
}
