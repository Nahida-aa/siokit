export interface PacketTypes {
  [key: string]: string;
  open: "0";
  close: "1";
  ping: "2";
  pong: "3";
  message: "4";
  upgrade: "5";
  noop: "6";
}

const PACKET_TYPES: PacketTypes = Object.create(null);
PACKET_TYPES["open"] = "0";
PACKET_TYPES["close"] = "1";
PACKET_TYPES["ping"] = "2";
PACKET_TYPES["pong"] = "3";
PACKET_TYPES["message"] = "4";
PACKET_TYPES["upgrade"] = "5";
PACKET_TYPES["noop"] = "6";

export interface PacketTypesReverse {
  [key: string]: PacketType;
  "0": "open";
  "1": "close";
  "2": "ping";
  "3": "pong";
  "4": "message";
  "5": "upgrade";
  "6": "noop";
}

const PACKET_TYPES_REVERSE: PacketTypesReverse = Object.create(null);
PACKET_TYPES_REVERSE["0"] = "open";
PACKET_TYPES_REVERSE["1"] = "close";
PACKET_TYPES_REVERSE["2"] = "ping";
PACKET_TYPES_REVERSE["3"] = "pong";
PACKET_TYPES_REVERSE["4"] = "message";
PACKET_TYPES_REVERSE["5"] = "upgrade";
PACKET_TYPES_REVERSE["6"] = "noop";

const ERROR_PACKET: Packet = { type: "error", data: "parser error" };

export { PACKET_TYPES, PACKET_TYPES_REVERSE, ERROR_PACKET };

export type PacketType =
  | "open"
  | "close"
  | "ping"
  | "pong"
  | "message"
  | "upgrade"
  | "noop"
  | "error";

export type RawData = string  | ArrayBuffer | Uint8Array
// Uint8Array、DataView 等都属于 ArrayBufferView。而在 Node.js 环境中，Buffer 也继承自 Uint8Array，因此它会自动命中 ArrayBufferView，无需显式写出 Buffer

export interface Packet {
  type: PacketType;
  options?: {
    compress: boolean;
    wsPreEncodedFrame?: any;
  };
  data?: RawData;
}

export type BinaryType = "nodebuffer" | "arraybuffer" | "blob";
