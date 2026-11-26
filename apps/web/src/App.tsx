import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { TooltipProvider } from '@/components/ui/popover';
import { Toaster } from '@/components/ui/toast';
import { ThemeProvider } from '@/lib/theme';
import type { createAppRouter } from './router';

export function App({ router }: { router: ReturnType<typeof createAppRouter> }) {
  return (
    <ThemeProvider>
      <QueryClientProvider client={router.options.context.queryClient}>
        <TooltipProvider delayDuration={400} skipDelayDuration={200}>
          <RouterProvider router={router} />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
