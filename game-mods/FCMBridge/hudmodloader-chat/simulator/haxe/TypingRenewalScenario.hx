/** Real editor + production roster send/confirmation path with deterministic aged timestamps. */
@:access(FCMChatWidget)
@:access(FcmServerSession)
@:access(FcmNativeApi)
@:access(FcmRoster)
@:access(SharedHUDTools)
class TypingRenewalScenario {
    static function check(ok:Bool, label:String):Void { if (!ok) throw label; }
    static function drain(widget:FCMChatWidget):Void {
        for (_ in 0...8) if (widget.runEventPollSafely() == 0) break;
    }
    public static function start(widget:FCMChatWidget, provider:String):Void {
        var attempts = 0;
        var timer = new haxe.Timer(250);
        timer.run = function():Void {
            try {
                if (widget._disposed) { timer.stop(); return; }
                if (++attempts > 60) throw "authenticated roster setup timed out";
                if (!widget._connected || widget._authState != "authenticated") return;
                widget.checkWorldId(); drain(widget);
                if (!widget._serverSessionReady) return;
                timer.stop();
                run(widget, provider);
                flash.Lib.trace("TYPING-RENEWAL PASS " + provider
                    + " editor=preserved renewal=confirmed history=preserved expiry=enforced stale=leave auth=gated");
            } catch (error:Dynamic) {
                timer.stop();
                widget.closeInputSharedHudTools("scenario teardown");
                flash.Lib.trace("TYPING-RENEWAL FAIL " + provider + " " + Std.string(error));
            }
        };
    }
    static function run(widget:FCMChatWidget, provider:String):Void {
        check(widget._api.provider == provider, "correct provider");
        MockXscal.enqueueServerHistory(widget._serverSession.room); drain(widget);
        widget.selectChannel(5);
        var records = widget._records.copy();
        var room = widget._serverSession.room;
        var nonce = widget._serverSession.target();
        var leaves = MockXscal.leaveControlCount;
        var ordinary = MockXscal.ordinarySendCount;
        widget.openInputSharedHudTools();
        var editor = SharedHUDTools.active.editor;
        check(widget._inputOpen && editor != null, "real editor opened");
        editor.text = "unfinished local draft";
        editor.setSelection(4, 9);
        for (cycle in 0...4) {
            // Age only test-owned deadlines. Fresh BSUI pushes remain necessary.
            MockGameData.publish("MapMenuData", {MarkerData:[
                {markerType:"PlayerRemote", text:"HarnessPeer", playerLevel:50}]});
            widget._serverSession.confirmedAt = flash.Lib.getTimer() - 59000;
            var before = widget._serverSession.confirmedAt;
            widget._lastRosterSentAt = 0; // force a due control without sleeping 30s
            var controls = MockXscal.serverControlCount;
            widget.tickRoster();
            check(MockXscal.serverControlCount == controls + 1, "renewal sent while typing");
            check(widget._serverSession.confirmedAt == before, "send receipt cannot extend confirmation");
            drain(widget);
            check(widget._serverSession.confirmedAt > before && widget._serverSessionReady,
                "relay confirmation renews session");
            check(widget._serverSession.room == room && widget._serverSession.target() == nonce
                && widget._chanIdx == 5 && widget._records.length == records.length
                && widget._records[records.length - 1] == records[records.length - 1],
                "room, selection and history preserved");
            check(widget._inputOpen && SharedHUDTools.active.editor == editor
                && widget.stage.focus == editor && editor.text == "unfinished local draft"
                && editor.selectionBeginIndex == 4 && editor.selectionEndIndex == 9,
                "editor ownership, focus, draft and selection preserved");
            widget.tickRoster();
            check(MockXscal.serverControlCount == controls + 1, "repeat tick is throttled");
        }
        check(MockXscal.leaveControlCount == leaves && MockXscal.ordinarySendCount == ordinary,
            "no leave or draft transmission");
        widget._lastRosterSentAt = 0;
        var controls = MockXscal.serverControlCount;
        widget._needsLink = true; widget.tickRoster(); widget._needsLink = false;
        check(MockXscal.serverControlCount == controls, "unlinked editor cannot renew");
        if (provider == "zfe") {
            var runtime = widget._api._runtimeInfo;
            widget._api._runtimeInfo = "zfe-chat-online-v1";
            widget.tickRoster();
            widget._api._runtimeInfo = runtime;
            check(MockXscal.serverControlCount == controls, "blocking ZFE remains gated");
        }
        widget._serverSession.confirmedAt = flash.Lib.getTimer() - 60000;
        widget.tickRoster();
        check(!widget._serverSessionReady, "missing confirmation still expires while typing");
        drain(widget);
        check(widget._serverSessionReady, "fresh relay reply restores expired confirmation");
        // Real observation expiry still retires membership while the editor stays open.
        for (entry in widget._rosterSnapshots.entries) entry.at = flash.Lib.getTimer() - FCMChatWidget.ROSTER_FRESH_MS - 1;
        widget._lastRosterObservationAt = flash.Lib.getTimer() - FCMChatWidget.ROSTER_FRESH_MS - 1;
        widget.tickRoster();
        check(!widget._serverSessionReady && MockXscal.leaveControlCount == leaves + 1,
            "stale observations leave rather than being refreshed by typing");
        check(widget._inputOpen && editor.text == "unfinished local draft", "expiry does not submit draft");
        widget.closeInputSharedHudTools("scenario complete");
    }
}
