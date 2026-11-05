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

function Row({ cells, columns }: { cells: Cell[]; columns: SheetColumn[] }) {
  return (
    <tr>
      {cells.map((cell, index) => (
        <td key={index} className={columns[index]?.right ? "nums text-right" : undefined} data-words={columns[index]?.words ? "" : undefined}>
          {printCell(cell, columns[index]?.signed)}
        </td>
      ))}
    </tr>
  );
}

/**
 * «Отчёты» on paper (journal.css, @media print): the company, the period and the table, nothing of
 * the screen around it. A real table, not the screen's grid: only a `<thead>` repeats on every page.
 * Never drawn on the screen; it is in the page all along so Ctrl+P needs no button.
 */
export function PrintSheet({ company, title, note, sheet }: { company: string | undefined; title: string; note: string | null; sheet: ReportSheet }) {
  return (
    <section className="desk-print" data-testid="desk-print-sheet">
      <header>
        {company ? <p className="desk-figure">{company}</p> : null}
        <h2>{title}</h2>
        {note ? <p>{note}</p> : null}
      </header>
      <table>
        <thead>
          <tr>
            {sheet.columns.map((column) => (
              <th key={column.title} scope="col" className={`desk-label uppercase ${column.right ? "text-right" : "text-left"}`}>
                {column.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sheet.rows.map((cells, index) => (
            <Row key={index} cells={cells} columns={sheet.columns} />
          ))}
        </tbody>
        <tfoot>
          <Row cells={sheet.total} columns={sheet.columns} />
        </tfoot>
      </table>
    </section>
  );
}
