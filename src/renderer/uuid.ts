// crypto.randomUUID is available in the sandboxed renderer (Web Crypto).
export function randomUUID(): string {
  return crypto.randomUUID()
}
