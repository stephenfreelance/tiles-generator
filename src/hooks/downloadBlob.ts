/** Saves bytes as a file through a temporary object URL and a download link. */
export function downloadBlob(data: Uint8Array, name: string, mime: string): void {
  // Blob parts must be backed by a plain ArrayBuffer; copy the rare shared-memory view.
  const part = data.buffer instanceof ArrayBuffer ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : new Uint8Array(data)
  const url = URL.createObjectURL(new Blob([part], { type: mime }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.rel = 'noopener'
  link.style.display = 'none'
  document.body.append(link)
  link.click()
  link.remove()
  // Safari starts the download after click() returns; revoking at once can cancel it.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
