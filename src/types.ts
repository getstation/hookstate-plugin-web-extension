/*
  Set of minimal types that should be compatible with
  corresponding types in:
  - @types/chrome
  - @types/firefox-webext-browser
*/
export interface Event<T extends (...args: any[]) => any> {
  addListener(callback: T): void;
  removeListener(callback: T): void;
}

// eslint-disable-next-line @typescript-eslint/ban-types
export type Message = Record<string, unknown> | object;

export type PortDisconnectEvent = Event<(port: MessagingPort) => void>
export type PortMessageEvent = Event<(message: Message) => void>

// should be compatible with chrome.runtime.Port and browser.runtime.Port
export interface MessagingPort {
  postMessage: (message: Message) => void;
  onDisconnect: PortDisconnectEvent;
  onMessage: PortMessageEvent;
}
