export type PacketTypes =  {
  open: "0"; // 服务端建立连接时发送的第一条消息
  close: "1";
  ping: "2"; 
  pong: "3";
  message: "4"; // 数据容器
  upgrade: "5"; // 协议升级（从轮询升级到 WebSocket 时使用）
  noop: "6"; // 空操作
} 
const PACKET_TYPES:  PacketTypes = Object.create(null); // no Map = no polyfill
PACKET_TYPES["open"] = "0";
PACKET_TYPES["close"] = "1";
PACKET_TYPES["ping"] = "2";
PACKET_TYPES["pong"] = "3";
PACKET_TYPES["message"] = "4";
PACKET_TYPES["upgrade"] = "5";
PACKET_TYPES["noop"] = "6";


export type PacketTypesReverse = {
  "0": "open";
  "1": "close";
  "2": "ping";
  "3": "pong";
  "4": "message";
  "5": "upgrade";
  "6": "noop";
}
const PACKET_TYPES_REVERSE: PacketTypesReverse = Object.create(null)
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

// RawData should be "string | Buffer | ArrayBuffer | ArrayBufferView | Blob", but Blob does not exist in Node.js and
// requires to add the dom lib in tsconfig.json
export type RawData = string  | ArrayBuffer | Uint8Array<ArrayBuffer>
// Uint8Array、DataView 等都属于 ArrayBufferView。而在 Node.js 环境中，Buffer 也继承自 Uint8Array，因此它会自动命中 ArrayBufferView，无需显式写出 Buffer

export interface Packet {
  type: PacketType;
  options?: {
    compress: boolean;
    wsPreEncoded?: string; // deprecated in favor of `wsPreEncodedFrame`
    wsPreEncodedFrame?: any; // computed in the socket.io-adapter package (should be typed as Buffer)
  };
  data?: RawData;
}

export type BinaryType = "nodebuffer" | "arraybuffer" | "blob";