import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { toast } from '@/components/ui/toast';
import { ApiError, describeApiError } from '@/lib/api';

/**
 * Lleva un error de la API a un formulario: validación → errores por campo; nombre duplicado →
 * error en `name`; el resto → aviso. Devuelve `true` si lo pudo ubicar en el formulario.
 */
export function applyApiError<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  messages: { duplicate: string },
): boolean {
  if (error instanceof ApiError) {
    if (error.code === 'DUPLICATE_NAME') {
      setError('name' as Path<T>, { message: messages.duplicate }, { shouldFocus: true });
      return true;
    }
    if (error.code === 'VALIDATION_FAILED' && error.issues.length > 0) {
      for (const issue of error.issues) {
        setError(issue.path as Path<T>, { message: issue.message });
      }
      return true;
    }
    if (error.code === 'MERCHANT_ARCHIVED') {
      toast({
        tone: 'danger',
        title: 'El comercio está archivado',
        description: 'Ya no se puede modificar. Recargá la página para ver su estado actual.',
      });
      return false;
    }
  }
  toast({ tone: 'danger', title: 'No se pudo guardar', description: describeApiError(error) });
  return false;
}
