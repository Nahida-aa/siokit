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
export interface WsRaw {
  send(data: RawData, options?: SendOptions): void
  close(code?: number, reason?: string): void
  readyState: WSReadyState
  url?: string | URL | null
  protocol?: string | null
}