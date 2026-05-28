import { newConn } from './conn.ts'

import { RawData } from "../parser/shared";

export type SendOptions = {
  compress?: boolean
} | boolean
export enum WSReadyState {
  CONNECTING,
  OPEN,
  CLOSING,
  CLOSED,
}
export interface WsRaw<T = undefined> {
  send(data: RawData, options?: SendOptions): void
  close(code?: number, reason?: string): void
  readyState: WSReadyState
  url?: string | URL | null
  protocol?: string | null
  data: T
}

export const newWsConn = (
  ws: { send(data: string | Uint8Array): void },
  opts?: { pingInterval?: number; pingTimeout?: number; maxPayload?: number },
) => {
  const conn = newConn((data) => { ws.send(data) }, opts)
  return { ...conn, raw: ws }
}

export type WsConn = ReturnType<typeof newWsConn>
