interface ServerToClientEvents {
  noArg: () => void;
  basicEmit: (a: number, b: string, c: Buffer) => void;
  withAck: (d: string, callback: (e: number) => void) => void;
  reply: (data: { received: boolean }) => void;
  msg: (data: string[]) => void;
}

interface ClientToServerEvents {
  hello: () => void;
  message: (data: string) => void;
  msg: (text: string) => void;
}

interface InterServerEvents {
  ping: () => void;
}

interface SocketData {
  name: string;
  age: number;
}