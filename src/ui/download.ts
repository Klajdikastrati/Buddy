/** Can this device hand a file to the share sheet (iOS: Save to Files, AirDrop, apps)? */
export function canShareFile(file: File): boolean {
  return typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })
}

export async function shareFile(file: File): Promise<void> {
  try {
    await navigator.share({ files: [file], title: file.name })
  } catch (e) {
    // Closing the share sheet isn't an error.
    if ((e as Error).name !== 'AbortError') throw e
  }
}

export function downloadFile(file: File): void {
  const url = URL.createObjectURL(file)
  const a = Object.assign(document.createElement('a'), { href: url, download: file.name })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
