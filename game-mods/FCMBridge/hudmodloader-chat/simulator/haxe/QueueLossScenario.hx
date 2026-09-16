/** Replays the native xScal retention pattern and a real unread cursor gap. */
@:access(FCMChatWidget)
class QueueLossScenario {
    static function check(label:String, ok:Bool):Void { if (!ok) throw label; }

    public static function start(widget:FCMChatWidget, provider:String):Void {
        var attempts = 0;
        var timer = new haxe.Timer(250);
        timer.run = function():Void {
            try {
                if (++attempts > 60) throw "queue diagnostic setup timed out";
                if (!widget._connected || widget._authState != "authenticated") return;
                timer.stop();
                check("selected adapter is active", widget._api.provider == provider);
                for (_ in 0...8) if (widget.runEventPollSafely() == 0) break;
                var before = widget._cursor;
                var records = widget._records.length;
                var controls = MockXscal.serverControlCount;
                var sends = MockXscal.ordinarySendCount;
                var connects = MockXscal.connectCount;
                MockXscal.SimLog.recent = [];
                for (i in 1...6) {
                    widget._history.finish();
                    var raw = '{"success":true,"cursor":' + (before + i) + ',"events":['
                        + '{"kind":"events.dropped","id":' + (before + i)
                        + ',"count":1,"body":"PRIVATE-DIAGNOSTIC","userId":987654,"token":"SECRET-DIAGNOSTIC"}]}';
                    widget.parseAndRenderEvents(raw);
                    check("contiguous retirement does not arm recovery", !widget._history.dropped
                        && !widget._history.needsRecovery(true, flash.Lib.getTimer()));
                    check("normal event cursor still advances", widget._cursor == before + i);
                }
                widget._history.finish();
                var gapId = widget._cursor + 3;
                widget.parseAndRenderEvents('{"success":true,"events":['
                    + '{"kind":"events.dropped","id":' + gapId + ',"dropped":2}]}');
                check("real unread gap still arms recovery", widget._history.dropped
                    && widget._history.needsRecovery(true, flash.Lib.getTimer()));
                var logs = MockXscal.SimLog.recent.join("\n");
                check("only first three markers emit extra diagnostics", widget._queueLossDiagnosticCount == 3
                    && logs.split("queue-loss diagnostic=").length == 4);
                check("queue metadata is visible without identity or content", logs.indexOf("count=1") >= 0
                    && logs.indexOf("PRIVATE-DIAGNOSTIC") < 0 && logs.indexOf("SECRET-DIAGNOSTIC") < 0
                    && logs.indexOf("987654") < 0);
                check("diagnostics add no transport or records", widget._records.length == records
                    && MockXscal.serverControlCount == controls && MockXscal.ordinarySendCount == sends
                    && MockXscal.connectCount == connects);
                flash.Lib.trace("QUEUE-RETENTION PASS " + provider
                    + " contiguous=acknowledged gap=recovered private=omitted");
            } catch (error:Dynamic) {
                timer.stop();
                flash.Lib.trace("QUEUE-DIAGNOSTIC FAIL " + provider + " " + Std.string(error));
            }
        };
    }
}
