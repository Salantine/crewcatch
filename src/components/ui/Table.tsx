import { cn } from "@/lib/cn";
import type { ReactNode, ThHTMLAttributes, TdHTMLAttributes } from "react";

/*
 * A data table is the densest surface in the portal, and the one where a11y
 * regressions hide: a missing `scope` makes a screen reader announce cell
 * contents with no idea what column they belong to. The scope prop is required
 * at the type level rather than defaulted to a guess.
 */

export interface TableColumn<T> {
  key: string;
  header: ReactNode;
  /** Align numeric columns right and render them in tabular figures. */
  numeric?: boolean;
  render: (row: T) => ReactNode;
}

export function Th({
  className,
  children,
  ...props
}: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      className={cn(
        "border-b border-border-strong px-3 py-2.5",
        "text-left text-[11px] font-semibold uppercase tracking-wider text-fg-muted",
        className,
      )}
      {...props}
    >
      {children}
    </th>
  );
}

export function Td({
  className,
  children,
  ...props
}: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn(
        "border-b border-border-subtle px-3 py-2.5 text-sm text-fg",
        className,
      )}
      {...props}
    >
      {children}
    </td>
  );
}

export interface DataTableProps<T> {
  /** Used to build an accessible name for the table. */
  caption: string;
  columns: TableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  empty?: ReactNode;
}

export function DataTable<T>({
  caption,
  columns,
  rows,
  rowKey,
  empty,
}: DataTableProps<T>) {
  if (rows.length === 0) {
    return (
      <div className="border border-border-subtle bg-surface-1 p-8 text-center">
        <p className="text-sm text-fg-muted">{empty ?? "No records."}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto border border-border-subtle">
      <table className="w-full border-collapse bg-surface-1">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((col) => (
              <Th
                key={col.key}
                className={col.numeric ? "text-right" : undefined}
              >
                {col.header}
              </Th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              className="transition-colors hover:bg-surface-2"
            >
              {columns.map((col) => (
                <Td
                  key={col.key}
                  className={cn(
                    col.numeric && "metric text-right",
                  )}
                >
                  {col.render(row)}
                </Td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
