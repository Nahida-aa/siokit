
export type SendOptions = {
  compress?: boolean
} | boolean
export enum WSReadyState {
  CONNECTING,
  OPEN,
  CLOSING,
  CLOSED,
}
export interface WsRaw {
  send(data: string | ArrayBuffer | Uint8Array, options?: SendOptions): void
  close(code?: number, reason?: string): void
  readyState: WSReadyState
  url?: string | URL | null
  protocol?: string | null
}