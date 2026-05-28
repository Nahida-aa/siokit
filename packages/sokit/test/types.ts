export interface ServerToClientEvents {
  noArg: () => void;
  basicEmit: (a: number, b: string, c: Uint8Array) => void;
  withAck: (d: string, callback: (e: number) => void) => void;
  reply: (data: { received: boolean }) => void;
  msg: (data: string[]) => void;
  echo: (data: { hello: string }) => void;
}

export interface ClientToServerEvents {
  hello: () => void;
  message: (data: string) => void;
  msg: (text: string) => void;
  ping: (callback: (response: string) => void) => void;
  echo: (data: { hello: string }) => void;
  binaryEcho: (data: Uint8Array) => void;
}

export interface InterServerEvents {
  ping: () => void;
}

export interface SocketData {
  name: string;
  age: number;
}