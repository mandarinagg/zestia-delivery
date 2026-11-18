import { useParams } from '@tanstack/react-router';
import { Construction } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/ui/states';

export function SectionPlaceholder({ title, description }: { title: string; description: string }) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <div className="rounded-lg border bg-card">
        <EmptyState
          icon={<Construction className="size-6" />}
          title="Esta sección todavía no está disponible"
          description="Se construye en un release posterior."
        />
      </div>
    </>
  );
}

function AreaShell({ title, description }: { title: string; description: string }) {
  return (
    <main
      id="contenido"
      className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-4 p-6"
    >
      <h1 className="text-xl font-semibold">{title}</h1>
      <div className="rounded-lg border bg-card">
        <EmptyState
          icon={<Construction className="size-6" />}
          title="Esta área todavía no está disponible"
          description={description}
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
  />
);

export function TrackingArea() {
  const { token } = useParams({ from: '/t/$token' });
  return (
    <AreaShell
      title="Seguimiento de pedido"
      description={`Acá el cliente va a ver el estado de su pedido. Código: ${token.slice(0, 4)}…`}
    />
  );
}
