// shared
export enum PacketType {
  CONNECT,
  DISCONNECT,
  EVENT,
  ACK,
  CONNECT_ERROR,
  BINARY_EVENT,
  BINARY_ACK,
}

export interface SioPacket {
  type: PacketType;
  nsp?: string;
  data?: any;
  id?: number;
  attachments?: number;
}
export type SocketId = string;