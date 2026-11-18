import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type RowSelectionState,
  type SortingState,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox, Input, Select } from '@/components/ui/input';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import { cn } from '@/lib/utils';

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    /** Filtro de columna: lista de opciones (se compara por igualdad exacta). */
    filterOptions?: { value: string; label: string }[];
    /** Texto accesible del filtro. Por defecto "Filtrar <encabezado>". */
    filterLabel?: string;
    /** Alineación numérica (montos, cantidades). */
    numeric?: boolean;
  }
}

export interface DataTableProps<TData> {
  columns: ColumnDef<TData, any>[]; // eslint-disable-line @typescript-eslint/no-explicit-any
  data: TData[];
  /** Nombre accesible de la tabla (obligatorio). */
  label: string;
  getRowId?: (row: TData) => string;
  searchPlaceholder?: string;
  pageSize?: number;
  pageSizeOptions?: number[];
  selectable?: boolean;
  onSelectionChange?: (rows: TData[]) => void;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  emptyState?: ReactNode;
  /** Altura máxima del área desplazable; el encabezado queda fijo. */
  maxHeightClass?: string;
  toolbar?: ReactNode;
}

const exactMatch = (row: { getValue: (id: string) => unknown }, id: string, value: string) =>
  String(row.getValue(id)) === value;

export function DataTable<TData>({
  columns,
  data,
  label,
  getRowId,
  searchPlaceholder = 'Buscar…',
  pageSize = 10,
  pageSizeOptions = [10, 25, 50],
  selectable = false,
  onSelectionChange,
  loading = false,
  error = false,
  onRetry,
  emptyState,
  maxHeightClass = 'max-h-[28rem]',
  toolbar,
}: DataTableProps<TData>) {
  const uid = useId();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const selectionColumn: ColumnDef<TData> = {
    id: '__select',
    enableSorting: false,
    header: ({ table }) => (
      <Checkbox
        aria-label="Seleccionar todas las filas de la página"
        checked={table.getIsAllPageRowsSelected()}
        ref={(el) => {
          if (el) el.indeterminate = table.getIsSomePageRowsSelected();
        }}
        onChange={table.getToggleAllPageRowsSelectedHandler()}
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        aria-label={`Seleccionar fila ${row.index + 1}`}
        checked={row.getIsSelected()}
        onChange={row.getToggleSelectedHandler()}
      />
    ),
  };

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns: selectable ? [selectionColumn, ...columns] : columns,
    getRowId,
    state: { sorting, columnFilters, globalFilter, rowSelection },
    initialState: { pagination: { pageSize } },
    defaultColumn: { filterFn: exactMatch },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange: (updater) => {
      const next = typeof updater === 'function' ? updater(rowSelection) : updater;
      setRowSelection(next);
      onSelectionChange?.(
        table
          .getCoreRowModel()
          .rows.filter((r) => next[r.id])
          .map((r) => r.original),
      );
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn: 'includesString',
    autoResetPageIndex: true,
  });

  const filterable = table
    .getAllLeafColumns()
    .filter((c) => c.columnDef.meta?.filterOptions && c.getCanFilter());
  const rowCount = table.getFilteredRowModel().rows.length;
  const { pageIndex, pageSize: size } = table.getState().pagination;
  const first = rowCount === 0 ? 0 : pageIndex * size + 1;
  const last = Math.min(rowCount, (pageIndex + 1) * size);
  const selectedCount = Object.keys(rowSelection).length;
  const hasFilters = globalFilter !== '' || columnFilters.length > 0;

  function clearFilters() {
    setGlobalFilter('');
    setColumnFilters([]);
  }

  return (
    <section aria-label={label} className="flex flex-col rounded-lg border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b p-2">
        <div className="relative min-w-48 flex-1 sm:max-w-xs">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground"
          />
          <Input
            type="search"
            aria-label={`Buscar en ${label}`}
            placeholder={searchPlaceholder}
            className="pl-8"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
          />
        </div>
        {filterable.map((col) => {
          const meta = col.columnDef.meta!;
          const header = typeof col.columnDef.header === 'string' ? col.columnDef.header : col.id;
          return (
            <Select
              key={col.id}
              className="w-auto min-w-36"
              aria-label={meta.filterLabel ?? `Filtrar ${header}`}
              value={(col.getFilterValue() as string | undefined) ?? ''}
              onChange={(e) => col.setFilterValue(e.target.value || undefined)}
            >
              <option value="">{header}: todos</option>
              {meta.filterOptions!.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          );
        })}
        {hasFilters ? (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Limpiar filtros
          </Button>
        ) : null}
        <div className="ml-auto flex items-center gap-2">{toolbar}</div>
      </div>

      {selectable && selectedCount > 0 ? (
        <p
          role="status"
          className="border-b bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground"
        >
          {selectedCount} {selectedCount === 1 ? 'fila seleccionada' : 'filas seleccionadas'}
        </p>
      ) : null}

      {error ? (
        <ErrorState onRetry={onRetry} />
      ) : loading ? (
        <TableSkeleton columns={Math.min(columns.length, 6)} />
      ) : (
        <div
          className={cn('overflow-auto', maxHeightClass)}
          tabIndex={0}
          aria-label={`${label}, desplazable`}
          role="region"
        >
          <table
            className="w-full border-collapse text-left text-sm"
            aria-describedby={`${uid}-count`}
          >
            <thead className="sticky top-0 z-10 bg-muted">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((header) => {
                    const sorted = header.column.getIsSorted();
                    const numeric = header.column.columnDef.meta?.numeric;
                    const title = header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext());
                    return (
                      <th
                        key={header.id}
                        scope="col"
                        aria-sort={
                          sorted === 'asc'
                            ? 'ascending'
                            : sorted === 'desc'
                              ? 'descending'
                              : undefined
                        }
                        className={cn(
                          'whitespace-nowrap border-b px-3 py-2 text-xs font-semibold text-muted-foreground',
                          numeric && 'text-right',
                        )}
                      >
                        {header.column.getCanSort() ? (
                          <button
                            type="button"
                            onClick={header.column.getToggleSortingHandler()}
                            className="inline-flex items-center gap-1 rounded-sm hover:text-foreground"
                          >
                            {title}
                            {sorted === 'asc' ? (
                              <ArrowUp aria-hidden="true" className="size-3.5" />
                            ) : sorted === 'desc' ? (
                              <ArrowDown aria-hidden="true" className="size-3.5" />
                            ) : (
                              <ArrowUpDown aria-hidden="true" className="size-3.5 opacity-60" />
                            )}
                            <span className="sr-only">
                              {sorted === 'asc'
                                ? ', orden ascendente, activar para descendente'
                                : sorted === 'desc'
                                  ? ', orden descendente, activar para quitar'
                                  : ', activar para ordenar'}
                            </span>
                          </button>
                        ) : (
                          title
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  data-selected={row.getIsSelected() || undefined}
                  className="border-b last:border-b-0 hover:bg-accent/50 data-[selected]:bg-accent"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className={cn(
                        'px-3 py-1.5',
                        cell.column.columnDef.meta?.numeric && 'text-right tabular-nums',
                      )}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {rowCount === 0 ? (
            hasFilters ? (
              <EmptyState
                title="Sin resultados"
                description="Ningún registro coincide con la búsqueda o los filtros."
                action={
                  <Button variant="outline" onClick={clearFilters}>
                    Limpiar filtros
                  </Button>
                }
              />
            ) : (
              (emptyState ?? <EmptyState title="Todavía no hay registros" />)
            )
          ) : null}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2 text-xs text-muted-foreground">
        <p id={`${uid}-count`} aria-live="polite" className="tabular-nums">
          {rowCount === 0 ? '0 resultados' : `${first}–${last} de ${rowCount}`}
        </p>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5">
            Filas
            <Select
              className="h-8 w-auto"
              value={size}
              onChange={(e) => table.setPageSize(Number(e.target.value))}
            >
              {pageSizeOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </label>
          <nav aria-label={`Paginación de ${label}`} className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              aria-label="Página anterior"
              disabled={!table.getCanPreviousPage()}
              onClick={() => table.previousPage()}
            >
              <ChevronLeft aria-hidden="true" className="size-4" />
            </Button>
            <span className="min-w-20 text-center tabular-nums">
              Página {rowCount === 0 ? 0 : pageIndex + 1} de {table.getPageCount()}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              aria-label="Página siguiente"
              disabled={!table.getCanNextPage()}
              onClick={() => table.nextPage()}
            >
              <ChevronRight aria-hidden="true" className="size-4" />
            </Button>
          </nav>
        </div>
      </div>
    </section>
  );
}
