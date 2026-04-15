/**
 * Module-level store for a file dropped on the onboarding welcome screen.
 *
 * sessionStorage / localStorage can't hold a File object, so we keep it in
 * module scope. It survives a client-side router.push() but is cleared on
 * hard refresh — which is fine; the upload page can re-prompt in that case.
 */

let _pending: File | null = null

export function setPendingFile(file: File): void {
  _pending = file
}

export function getPendingFile(): File | null {
  return _pending
}

export function clearPendingFile(): void {
  _pending = null
}
