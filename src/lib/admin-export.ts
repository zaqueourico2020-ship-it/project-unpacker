import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export const brl = (n: number) =>
  Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const dateBR = (iso: string) => new Date(iso).toLocaleString("pt-BR");

export function exportXLSX(filename: string, rows: any[], sheetName = "Dados") {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}

export function exportPDF(filename: string, title: string, columns: string[], rows: (string | number)[][]) {
  const doc = new jsPDF({ orientation: "landscape" });
  doc.setFontSize(14);
  doc.text(title, 14, 14);
  doc.setFontSize(9);
  doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, 14, 20);
  autoTable(doc, {
    startY: 26,
    head: [columns],
    body: rows,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [30, 41, 59] },
  });
  doc.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
}
