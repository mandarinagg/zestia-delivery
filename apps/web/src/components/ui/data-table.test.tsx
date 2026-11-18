import type { ColumnDef } from '@tanstack/react-table';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataTable } from './data-table';

interface Row {
  id: string;
  name: string;
  status: 'a' | 'b';
}

const rows: Row[] = [
  { id: '1', name: 'Charlie', status: 'a' },
  { id: '2', name: 'Alfa', status: 'b' },
  { id: '3', name: 'Bravo', status: 'a' },
  { id: '4', name: 'Delta', status: 'b' },
  { id: '5', name: 'Echo', status: 'a' },
];

const columns: ColumnDef<Row>[] = [
  { accessorKey: 'name', header: 'Nombre' },
  {
    accessorKey: 'status',
    header: 'Estado',
    meta: {
      filterLabel: 'Filtrar por estado',
      filterOptions: [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
      ],
    },
  },
];

function names() {
  const body = screen.getAllByRole('rowgroup')[1]!;
  return within(body)
    .getAllByRole('row')
    .map((r) => within(r).getAllByRole('cell').at(-2)?.textContent ?? '');
}

function renderTable(props: Partial<Parameters<typeof DataTable<Row>>[0]> = {}) {
  return render(
    <DataTable label="Prueba" columns={columns} data={rows} getRowId={(r) => r.id} {...props} />,
  );
}

describe('DataTable', () => {
  it('ordena por columna y expone aria-sort', async () => {
    const user = userEvent.setup();
    renderTable({ selectable: true, pageSize: 10 });
    const header = screen.getByRole('columnheader', { name: /Nombre/ });
    expect(header).not.toHaveAttribute('aria-sort');

    await user.click(within(header).getByRole('button'));
    expect(header).toHaveAttribute('aria-sort', 'ascending');
    expect(names()).toEqual(['Alfa', 'Bravo', 'Charlie', 'Delta', 'Echo']);

    await user.click(within(header).getByRole('button'));
    expect(header).toHaveAttribute('aria-sort', 'descending');
    expect(names()[0]).toBe('Echo');
  });

  it('busca con el filtro global y muestra estado sin resultados', async () => {
    const user = userEvent.setup();
    renderTable();
    await user.type(screen.getByRole('searchbox', { name: 'Buscar en Prueba' }), 'brav');
    expect(screen.getAllByRole('row')).toHaveLength(2); // encabezado + 1
    expect(screen.getByText('1–1 de 1')).toBeInTheDocument();

    await user.clear(screen.getByRole('searchbox'));
    await user.type(screen.getByRole('searchbox'), 'zzz');
    expect(screen.getByText('Sin resultados')).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: 'Limpiar filtros' })[0]!);
    expect(screen.getByText('1–5 de 5')).toBeInTheDocument();
  });

  it('filtra por columna', async () => {
    const user = userEvent.setup();
    renderTable();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filtrar por estado' }), 'b');
    expect(screen.getByText('1–2 de 2')).toBeInTheDocument();
    expect(screen.queryByText('Charlie')).not.toBeInTheDocument();
  });

  it('pagina', async () => {
    const user = userEvent.setup();
    renderTable({ pageSize: 2, pageSizeOptions: [2, 5] });
    expect(screen.getByText('1–2 de 5')).toBeInTheDocument();
    expect(screen.getByText('Página 1 de 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Página anterior' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Página siguiente' }));
    expect(screen.getByText('3–4 de 5')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Página siguiente' }));
    expect(screen.getByRole('button', { name: 'Página siguiente' })).toBeDisabled();
  });

  it('selecciona filas y avisa por callback', async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();
    renderTable({ selectable: true, onSelectionChange });
    await user.click(screen.getByRole('checkbox', { name: 'Seleccionar fila 2' }));
    expect(onSelectionChange).toHaveBeenLastCalledWith([rows[1]]);
    expect(screen.getByText('1 fila seleccionada')).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: /Seleccionar todas/ }));
    expect(screen.getByText('5 filas seleccionadas')).toBeInTheDocument();
  });

  it('muestra vacío, carga y error con reintento', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const { rerender } = renderTable({ data: [], emptyState: <p>Nada por acá</p> });
    expect(screen.getByText('Nada por acá')).toBeInTheDocument();

    rerender(<DataTable label="Prueba" columns={columns} data={rows} loading />);
    expect(screen.getByRole('status', { name: 'Cargando tabla' })).toBeInTheDocument();

    rerender(<DataTable label="Prueba" columns={columns} data={rows} error onRetry={onRetry} />);
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
