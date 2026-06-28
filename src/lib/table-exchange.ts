import * as XLSX from "xlsx";

export type ExportColumn<T> = {
  key: string;
  label: string;
  width?: number;
  getValue: (row: T) => unknown;
};

export type ImportedTable = {
  headers: string[];
  rows: Record<string, string>[];
  headerRowNumber: number;
  sheetName?: string;
};

function displayValue(value: unknown) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(String).join("、");
  if (value instanceof Date) return value;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.label === "string") return record.label;
    if (typeof record.href === "string") return record.href;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return value;
}

function stringValue(value: unknown) {
  const displayed = displayValue(value);
  if (displayed instanceof Date) return displayed.toISOString().slice(0, 10);
  return String(displayed ?? "").trim();
}

function safeSheetName(value: string) {
  return value.replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 31) || "Sheet1";
}

function safeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "-").trim() || "table";
}

function pixelWidthToExcelWidth(width?: number) {
  return Math.max(10, Math.min(48, Math.round((width ?? 160) / 7.2)));
}

function encodeRange(rowStart: number, colStart: number, rowEnd: number, colEnd: number) {
  return XLSX.utils.encode_range({
    s: { r: rowStart, c: colStart },
    e: { r: rowEnd, c: colEnd }
  });
}

function applyWorksheetPresentation(
  worksheet: XLSX.WorkSheet,
  rowCount: number,
  columnCount: number,
  columns: Array<{ width?: number }>,
  headerRowIndex: number
) {
  worksheet["!cols"] = columns.map((column) => ({ wch: pixelWidthToExcelWidth(column.width) }));
  worksheet["!autofilter"] = {
    ref: encodeRange(headerRowIndex, 0, Math.max(headerRowIndex, rowCount - 1), Math.max(0, columnCount - 1))
  };
  worksheet["!freeze"] = { xSplit: 0, ySplit: headerRowIndex + 1 };

  const range = XLSX.utils.decode_range(worksheet["!ref"] ?? encodeRange(0, 0, 0, 0));
  for (let rowIndex = range.s.r; rowIndex <= range.e.r; rowIndex += 1) {
    for (let columnIndex = range.s.c; columnIndex <= range.e.c; columnIndex += 1) {
      const address = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
      const cell = worksheet[address];
      if (!cell) continue;
      cell.s = {
        font: rowIndex === headerRowIndex ? { bold: true, color: { rgb: "FFFFFF" } } : { color: { rgb: "132033" } },
        fill: rowIndex === headerRowIndex ? { fgColor: { rgb: "0F766E" } } : undefined,
        alignment: { vertical: "top", wrapText: true },
        border: {
          top: { style: "thin", color: { rgb: "D8E0EB" } },
          bottom: { style: "thin", color: { rgb: "D8E0EB" } },
          left: { style: "thin", color: { rgb: "D8E0EB" } },
          right: { style: "thin", color: { rgb: "D8E0EB" } }
        }
      };
    }
  }
}

export function downloadStyledExcel<T>({
  filename,
  sheetName,
  columns,
  rows,
  note
}: {
  filename: string;
  sheetName: string;
  columns: Array<ExportColumn<T>>;
  rows: T[];
  note?: string;
}) {
  const headerRow = columns.map((column) => column.label);
  const dataRows = rows.map((row) => columns.map((column) => displayValue(column.getValue(row))));
  const matrix = note ? [[note], headerRow, ...dataRows] : [headerRow, ...dataRows];
  const worksheet = XLSX.utils.aoa_to_sheet(matrix);
  const headerRowIndex = note ? 1 : 0;

  if (note) {
    worksheet["!merges"] = [
      {
        s: { r: 0, c: 0 },
        e: { r: 0, c: Math.max(0, columns.length - 1) }
      }
    ];
  }

  applyWorksheetPresentation(worksheet, matrix.length, columns.length, columns, headerRowIndex);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, safeSheetName(sheetName));
  const output = XLSX.write(workbook, {
    bookType: "xlsx",
    type: "array",
    cellStyles: true
  });
  const blob = new Blob([output], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${safeFileName(filename)}.xlsx`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function parseDelimited(text: string, delimiter: "," | "\t"): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let insideQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === "\"") {
      if (insideQuotes && next === "\"") {
        cell += "\"";
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (!insideQuotes && char === delimiter) {
      row.push(cell.trim());
      cell = "";
      continue;
    }

    if (!insideQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function normalizedHeaderToken(value: string) {
  return value
    .toLowerCase()
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/\s+/g, "")
    .replace(/[：:()（）/\\|_\-—–]/g, "");
}

function rowsToImportedTable(rawRows: unknown[][], expectedHeaders: string[] = []): ImportedTable {
  const cleanedRows = rawRows
    .map((row) => row.map((cell) => stringValue(cell)))
    .filter((row) => row.some(Boolean));
  const expected = new Set(expectedHeaders.map(normalizedHeaderToken).filter(Boolean));
  let headerRowIndex = 0;
  let resolvedHeaderRow: string[] = cleanedRows[0] ?? [];
  let bestScore = -1;

  for (let index = 0; index < Math.min(cleanedRows.length, 20); index += 1) {
    const currentRow = cleanedRows[index];
    const previousRow = index > 0 ? cleanedRows[index - 1] : [];
    const row = currentRow.map((cell, columnIndex) => cell || previousRow[columnIndex] || "");
    const nonEmpty = row.filter(Boolean);
    const matches = nonEmpty.filter((cell) => expected.has(normalizedHeaderToken(cell))).length;
    const score = expected.size
      ? matches * 100 + Math.min(nonEmpty.length, expected.size)
      : nonEmpty.length;
    if (score > bestScore) {
      bestScore = score;
      headerRowIndex = index;
      resolvedHeaderRow = row;
    }
  }

  const bodyRows = cleanedRows.slice(headerRowIndex + 1);
  const headerRow = resolvedHeaderRow;
  const headers = (headerRow ?? []).map((header, index) => header.trim() || `列${index + 1}`);
  return {
    headers,
    headerRowNumber: headerRowIndex + 1,
    rows: bodyRows
      .map((row) =>
        Object.fromEntries(headers.map((header, index) => [header, String(row[index] ?? "").trim()]))
      )
      .filter((row) => Object.values(row).some(Boolean))
  };
}

function parseHtmlTable(text: string, expectedHeaders: string[] = []): ImportedTable {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, "text/html");
  const table = doc.querySelector("table");
  if (!table) {
    throw new Error("未在文件中找到表格，请使用 xlsx、xls、CSV 或 TSV 文件。");
  }
  const rawRows = Array.from(table.querySelectorAll("tr")).map((tr) =>
    Array.from(tr.querySelectorAll("th,td")).map((cell) => cell.textContent?.trim() ?? "")
  );
  return rowsToImportedTable(rawRows, expectedHeaders);
}

async function parseWorkbookFile(file: File, expectedHeaders: string[] = []): Promise<ImportedTable> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, {
    type: "array",
    cellDates: true,
    raw: false,
    cellStyles: true
  });
  if (!workbook.SheetNames.length) {
    throw new Error("Excel 文件中没有可读取的工作表。");
  }
  const expected = new Set(expectedHeaders.map(normalizedHeaderToken).filter(Boolean));
  const candidates = workbook.SheetNames.map((sheetName, sheetIndex) => {
    const worksheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      defval: "",
      raw: false
    });
    const parsed = rowsToImportedTable(rawRows, expectedHeaders);
    const recognizedHeaders = parsed.headers.filter((header) =>
      expected.has(normalizedHeaderToken(header))
    ).length;
    return {
      ...parsed,
      sheetName,
      score: recognizedHeaders * 1000 + parsed.rows.length - sheetIndex / 100
    };
  });
  const selected = candidates.sort((left, right) => right.score - left.score)[0];
  return {
    headers: selected.headers,
    rows: selected.rows,
    headerRowNumber: selected.headerRowNumber,
    sheetName: selected.sheetName
  };
}

export async function parseLocalTable(
  file: File,
  options: { expectedHeaders?: string[] } = {}
): Promise<ImportedTable> {
  const expectedHeaders = options.expectedHeaders ?? [];
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "xlsx" || extension === "xls") {
    try {
      return await parseWorkbookFile(file, expectedHeaders);
    } catch (error) {
      const text = await file.text();
      if (/<table[\s>]/i.test(text)) return parseHtmlTable(text, expectedHeaders);
      throw error;
    }
  }

  const text = await file.text();
  if (extension === "html" || /<table[\s>]/i.test(text)) {
    return parseHtmlTable(text, expectedHeaders);
  }
  return rowsToImportedTable(
    parseDelimited(text, extension === "tsv" ? "\t" : ","),
    expectedHeaders
  );
}

export function normalizeHeader(value: string) {
  return normalizedHeaderToken(value);
}

export function getImportedValue(row: Record<string, string>, candidates: string[]) {
  const normalized = new Map(Object.keys(row).map((key) => [normalizeHeader(key), key]));
  for (const candidate of candidates) {
    const matchedKey = normalized.get(normalizeHeader(candidate));
    if (matchedKey) return row[matchedKey];
  }
  return "";
}
