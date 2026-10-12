// 표 내려받기 — 엑셀(.xlsx, 시트 여러 개)과 CSV(맥 Numbers·메모장 등 어디서나 열림).
// 엑셀 라이브러리(SheetJS)는 버튼을 누를 때만 불러온다(처음 화면이 무거워지지 않게).

export type Cell = string | number;
export interface Sheet { name: string; rows: Cell[][]; cols?: number[] }

/** 엑셀 파일 — 시트 이름은 31자까지, 쓸 수 없는 글자는 뺀다 */
export async function downloadXlsx(sheets: Sheet[], filename: string): Promise<void> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(s.rows);
    if (s.cols) ws['!cols'] = s.cols.map(wch => ({ wch }));
    let name = s.name.replace(/[\\/?*[\]:]/g, '·').slice(0, 31) || 'Sheet';
    for (let n = 2; used.has(name); n++) name = `${s.name.slice(0, 28)} ${n}`;
    used.add(name);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}

/** CSV 파일 — 한글이 깨지지 않게 BOM 을 붙인다. 시트가 여러 개면 빈 줄을 두고 이어 붙인다 */
export function downloadCsv(sheets: Sheet[], filename: string): void {
  const esc = (v: Cell) => {
    const t = String(v ?? '');
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const parts = sheets.map(s => (sheets.length > 1 ? [[`[${s.name}]`], ...s.rows] : s.rows).map(r => r.map(esc).join(',')).join('\r\n'));
  const blob = new Blob(['﻿' + parts.join('\r\n\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
