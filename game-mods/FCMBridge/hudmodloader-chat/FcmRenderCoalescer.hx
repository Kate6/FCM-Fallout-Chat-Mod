/**
 * Tiny burst coalescer: rapid ingest/poll/ACK triggers collapse into a single
 * deferred render. Tab switches, resizes, and config changes still render
 * immediately (full path); the coalescer only serves tail-append traffic.
 */
class FcmRenderCoalescer {
    var _dirty:Bool = false;
    var _scheduled:Bool = false;

    public function new() {}

    /** Mark a deferred render needed; true when the caller should schedule the tick. */
    public function request():Bool {
        _dirty = true;
        if (_scheduled) return false;
        _scheduled = true;
        return true;
    }

    /** True while a deferred tick is outstanding. */
    public function isScheduled():Bool {
        return _scheduled;
    }

    /** True when a render is still needed. */
    public function isDirty():Bool {
        return _dirty;
    }

    /**
     * Consume the scheduled tick. Returns true when the tick should render
     * (a render was dirty); always clears the scheduled flag so a stale timer
     * cannot render twice.
     */
    public function consumeTick():Bool {
        _scheduled = false;
        if (!_dirty) return false;
        _dirty = false;
        return true;
    }

    /** Drop any pending render (e.g. widget teardown or immediate full render). */
    public function reset():Void {
        _dirty = false;
        _scheduled = false;
    }
}
