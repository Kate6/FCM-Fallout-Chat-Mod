type Frame = { type: string; payload: Record<string, unknown> };
export interface ModerationRow extends Record<string, unknown> { id: string; channelId: string; serverDisplayId: string }
export interface ModerationPage { messages: ModerationRow[]; nextCursor: string | null }
export interface ServerModerationDependencies {
  authorize(): Promise<boolean>;
  history(cursor: string | null): Promise<ModerationPage>;
}
/** Read-only, bounded per-socket observation. Never participates in membership/send. */
export class ServerModerationConnection {
  private enabled = false;
  private disposed = false;
  private epoch = 0;
  private pending = 0;
  private tail = Promise.resolve();
  private seen = new Set<string>();
  private nextCursor: string | null = null;
  constructor(private emit: (frame: Frame) => void, private deps: ServerModerationDependencies) {}
  dispose(): void { this.disposed = true; this.enabled = false; this.epoch++; this.seen.clear(); }
  private state(status: string): void { if (!this.disposed) this.emit({ type: 'server:moderation:state', payload: { status } }); }
  private async authorized(epoch: number): Promise<boolean> {
    const allowed = await this.deps.authorize();
    if (this.disposed || epoch !== this.epoch || !this.enabled) return false;
    if (!allowed) { this.enabled = false; this.epoch++; this.seen.clear(); this.state('denied'); }
    return allowed;
  }
  private queue(work: (epoch: number) => Promise<void>): Promise<void> {
    if (this.disposed || !this.enabled) return Promise.resolve();
    if (this.pending >= 128) { this.enabled = false; this.epoch++; this.seen.clear(); this.state('unavailable'); return Promise.resolve(); }
    const epoch = this.epoch;
    this.pending++;
    this.tail = this.tail.then(async () => {
      if (!this.disposed && this.enabled && epoch === this.epoch) await work(epoch);
    }).catch(() => {
      if (!this.disposed && epoch === this.epoch) { this.enabled = false; this.epoch++; this.seen.clear(); this.state('unavailable'); }
    }).finally(() => { this.pending--; });
    return this.tail;
  }
  private deliver(rows: ModerationRow[], historyReplay: boolean): void {
    const messages = rows.filter(row => {
      const key = `${row.channelId}:${row.id}`;
      if (this.seen.has(key)) return false;
      this.seen.add(key);
      if (this.seen.size > 2000) this.seen.delete(this.seen.values().next().value!);
      return true;
    });
    if (messages.length || historyReplay) this.emit({ type: 'server:moderation:messages', payload: { historyReplay, messages,
      ...(historyReplay ? { hasMore: this.nextCursor !== null, nextCursor: this.nextCursor } : {}) } });
  }
  subscribe(enabled: boolean): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (!enabled) { this.enabled = false; this.epoch++; this.seen.clear(); this.state('inactive'); return Promise.resolve(); }
    if (this.enabled) return this.validate();
    this.enabled = true;
    return this.queue(async epoch => {
      if (!(await this.authorized(epoch))) return;
      const page = await this.deps.history(null);
      if (!(await this.authorized(epoch))) return;
      this.nextCursor = page.nextCursor;
      this.state('ready'); this.deliver(page.messages.slice(-500), true);
    });
  }
  history(cursor: unknown): Promise<void> {
    if (typeof cursor !== 'string' || cursor.length > 128 || !cursor) return Promise.resolve();
    return this.queue(async epoch => {
      if (cursor !== this.nextCursor || !(await this.authorized(epoch))) return;
      const page = await this.deps.history(cursor);
      if (!(await this.authorized(epoch))) return;
      this.nextCursor = page.nextCursor;
      this.deliver(page.messages.slice(-500), true);
    });
  }
  validate(): Promise<void> { return this.queue(async epoch => { await this.authorized(epoch); }); }
  receive(load: () => Promise<ModerationRow | null>): Promise<void> {
    return this.queue(async epoch => {
      if (!(await this.authorized(epoch))) return;
      const row = await load();
      if (row && await this.authorized(epoch)) this.deliver([row], false);
    });
  }
}
