export function useExport() {
  function exportCSV(headers, rows, filename = 'export.csv') {
    const BOM = '\uFEFF'
    const headerLine = headers.map(h => `"${h.label}"`).join(',')
    const dataLines = rows.map(row =>
      headers.map(h => `"${row[h.key] ?? ''}"`).join(',')
    )
    const csv = BOM + headerLine + '\n' + dataLines.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  return { exportCSV }
}
