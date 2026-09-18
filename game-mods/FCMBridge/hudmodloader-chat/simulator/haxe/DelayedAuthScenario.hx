/** Reproduce an asynchronous native handshake without sending chat or forcing auth refresh. */
@:access(FCMChatWidget)
class DelayedAuthScenario {
    static function check(label:String, ok:Bool):Void { if (!ok) throw label; }

    public static function start(widget:FCMChatWidget, provider:String):Void {
        var attempts = 0;
        var released = false;
        var initialAuthPolls = 0;
        var timer = new haxe.Timer(250);
        timer.run = function():Void {
            try {
                if (++attempts > 60) throw "automatic auth/Server-room recovery timed out";
                if (!widget._connected) return;
                if (!released) {
                    check("requested provider is active", widget._api.provider == provider);
                    check("startup auth remains pending", widget._authState == "limited"
                        && widget._relayUserId.length == 0 && MockXscal.authPollCount > 0);
                    // Read-only events and fresh game data must not bypass the auth gate.
                    widget.runEventPollSafely();
                    widget.checkWorldId();
                    check("history and roster exist while auth is pending", widget._records.length > 0
                        && widget.freshRosterNames().length > 0);
                    check("pending auth cannot bind Server", !widget._serverSessionReady
                        && MockXscal.serverControlCount == 0);
                    initialAuthPolls = MockXscal.authPollCount;
                    MockXscal.authReady = true;
                    released = true;
                    flash.Lib.trace("DELAYED-AUTH PENDING " + provider + " history=received roster=read controls=blocked");
                    return;
                }
                // Do not call refreshAuthState, sendMessage, or world/poll ticks here:
                // production timers must recover the initial handshake on their own.
                if (!widget._serverSessionReady) return;
                check("normal polling discovers authenticated identity", widget._authState == "authenticated"
                    && widget._relayUserId.length > 0 && MockXscal.authPollCount > initialAuthPolls);
                check("no reconnect or user message was needed", MockXscal.connectCount == 1
                    && MockXscal.ordinarySendCount == 0 && !widget._inputOpen);
                check("confirmed Server tab is attached and visible", widget._subTf != null
                    && widget._subTf.parent == widget && widget._subTf.visible
                    && widget._subTf.text.indexOf("SERVER") >= 0 && MockXscal.serverControlCount > 0);
                widget._canModerate = true;
                widget.renderSubTabs();
                check("staff own Server label", widget._subTf.text.indexOf("YOUR SERVER") >= 0);
                widget._canModerate = false;
                widget.renderSubTabs();
                check("revoked regular Server label", widget._subTf.text.indexOf("YOUR SERVER") < 0
                    && widget._subTf.text.indexOf("SERVER") >= 0);
                flash.Lib.trace("SERVER-LABEL PASS " + provider + " regular=Server staff=Your-server revoked=Server");
                timer.stop();
                flash.Lib.trace("DELAYED-AUTH PASS " + provider + " automatic=auth,roster,tab reconnects=0 user-sends=0");
            } catch (error:Dynamic) {
                timer.stop();
                flash.Lib.trace("DELAYED-AUTH FAIL " + provider + " " + Std.string(error));
            }
        };
    }
}
