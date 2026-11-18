import { printCell, type Cell, type ReportSheet, type SheetColumn } from "@/lib/desk/report-export";

/** Hands the file to the browser; the link goes as soon as it has been clicked. */
export function saveCsv(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const align = (column: SheetColumn | undefined) => (column?.day ? "text-center" : column?.right ? "text-right" : "text-left");

function Row({ cells, columns, tabel }: { cells: Cell[]; columns: SheetColumn[]; tabel: boolean }) {
  return (
    <tr>
      {cells.map((cell, index) => {
        const column = columns[index];
        // a day of the табель: an empty day is empty on paper, not the dash of a missing value
        const text = column?.day && (cell === null || cell === "") ? "" : printCell(cell, column?.signed);
        return (
          <td
            key={index}
            className={`${column?.right || column?.day ? "nums " : ""}${align(column)}`}
            data-words={column?.words ? "" : undefined}
            data-tight={column?.tight ? "" : undefined}
            data-day={column?.day ? "" : undefined}
            data-dim={tabel && column?.dim ? "" : undefined}
          >
            {text}
          </td>
        );
      })}
    </tr>
  );
}

/**
 * «Отчёты» on paper (journal.css and reports-tabel.css, @media print): the company, the period and
 * the table, nothing of the screen around it. A real table, not the screen's grid: only a `<thead>`
 * repeats on every page. «Сводка» — portrait, the words whole; «Табель» — landscape A4, a narrow
 * column a day with the file's short words and the legend under it. Never drawn on the screen; it
 * is in the page all along so Ctrl+P needs no button.
 */
export function PrintSheet({
  company,
  title,
  note,
  sheet,
  kind,
}: {
  company: string | undefined;
  title: string;
  note: string | null;
  sheet: ReportSheet;
  kind: "day" | "tabel";
}) {
  const tabel = kind === "tabel";
  const days = sheet.columns.filter((column) => column.day).length;
  return (
    <section className={`desk-print${tabel ? " rep-tabel-print" : ""}`} data-kind={kind} data-long={tabel && days > 31 ? "" : undefined} data-testid="desk-print-sheet">
      <header>
        {company ? <p className="desk-figure">{company}</p> : null}
        <h2>{title}</h2>
        {note ? <p>{note}</p> : null}
      </header>
      <table>
        {/* the widths are the paper's (reports-tabel.css): a fixed table, the words get what is left */}
        <colgroup>
          {sheet.columns.map((column, index) => (
            <col key={index} data-col={index === 0 ? "name" : column.day ? "day" : column.words ? "words" : tabel ? "total" : "text"} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {sheet.columns.map((column, index) => (
              <th
                key={index}
                scope="col"
                className={`${tabel ? "" : "desk-label uppercase "}${align(column)}`}
                data-tight={column.tight ? "" : undefined}
                data-day={column.day ? "" : undefined}
                data-dim={tabel && column.dim ? "" : undefined}
              >
                {column.title}
                {column.sub ? <span className="rep-tabel-print-sub">{column.sub}</span> : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sheet.rows.map((cells, index) => (
            <Row key={index} cells={cells} columns={sheet.columns} tabel={tabel} />
          ))}
        </tbody>
        <tfoot>
          <Row cells={sheet.total} columns={sheet.columns} tabel={tabel} />
        </tfoot>
      </table>
      {sheet.notes?.map((line) => (
        <p key={line} className="rep-tabel-print-note">
          {line}
        </p>
      ))}
    </section>
  );
}
