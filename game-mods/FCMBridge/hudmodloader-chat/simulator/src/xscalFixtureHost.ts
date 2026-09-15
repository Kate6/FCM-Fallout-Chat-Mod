export type InstalledXscalFixture = {
  evidence: { version: string; sha256: string; sizeBytes: number; falloutRuntime: string };
  runtime: string;
  capability: string;
  chatMethods: string[];
  inputCallbacks: string[];
  keys: Record<string, number>;
  events: Array<Record<string, string>>;
};

export class InstalledXscalHost {
  private registered = new Set<number>();
  private pressed = new Set<number>();
  private cursor = 0;
  private connected = false;

  constructor(readonly fixture: InstalledXscalFixture) {}
  connect(): boolean { this.connected = true; return true; }
  getRuntimeInfo() { return { success: true, runtime: this.fixture.runtime, version: this.fixture.evidence.version, protocol: 1, mode: 'simulated-installed-contract', capabilities: [this.fixture.capability] }; }
  pollEvents() {
    if (!this.connected) return { success: false, cursor: this.cursor, events: [] };
    const events = this.cursor === 0 ? this.fixture.events : [];
    this.cursor += events.length;
    return { success: true, cursor: this.cursor, events };
  }
  sendMessage(value: { channel?: string; body?: string }) {
    if (!this.connected || !value.channel || !value.body || value.body.length > 500) return { success: false };
    return { success: true, messageId: `sim-send-${this.cursor + 1}` };
  }
  call(name: string, virtualKey: number): boolean {
    if (!this.fixture.inputCallbacks.includes(name) || virtualKey < 1 || virtualKey > 255) return false;
    if (name === 'Input.RegisterKey') { if (this.registered.has(virtualKey)) return false; this.registered.add(virtualKey); return true; }
    if (name === 'Input.UnregisterKey') { this.pressed.delete(virtualKey); return this.registered.delete(virtualKey); }
    return this.registered.has(virtualKey) && this.pressed.has(virtualKey);
  }
  setPressed(virtualKey: number, down: boolean): boolean {
    if (!this.registered.has(virtualKey)) return false;
    if (down) this.pressed.add(virtualKey); else this.pressed.delete(virtualKey);
    return true;
  }
}
