/** Visibility policy exercised through the compiled widget on both provider routes. */
@:access(FCMChatWidget)
class VisibilityScenario {
    static function check(label:String, ok:Bool):Void { if (!ok) throw label; }
    public static function start(widget:FCMChatWidget, provider:String):Void {
        var attempts = 0;
        var timer = new haxe.Timer(250);
        timer.run = function():Void {
            try {
                if (++attempts > 60) throw "visibility setup timed out";
                if (!widget._connected || widget._authState != "authenticated") return;
                timer.stop();
                check("adapter", widget._api.provider == provider);
                for (_ in 0...8) if (widget.runEventPollSafely() == 0) break;
                widget._autoHideOn = true;
                MockGameData.setHudMode("All");
                widget.show();
                widget.handleSubmittedText("/hide");
                check("slash hide", !widget.visible && widget._hidden);
                MockGameData.setHudMode("Pipboy");
                MockGameData.setHudMode("All");
                check("manual hide survives menu exit", !widget.visible && widget._hidden);
                widget.handleUserEvent("Escape", true);
                widget.handleUserEvent("Escape", false);
                check("Escape does not restore manual hide", !widget.visible);
                var id = widget._cursor + 1;
                widget.parseAndRenderEvents('{"success":true,"events":[{"id":' + id
                    + ',"kind":"chat.message","channel":"global","messageId":"visibility-1",'
                    + '"senderUserId":"fixture-peer","senderDisplayName":"Peer","body":"visibility fixture"}]}');
                check("hidden message retained", widget._records[widget._records.length - 1].messageId == "visibility-1");
                check("manual hide survives incoming message", !widget.visible && widget._hidden);
                widget.openInput();
                check("explicit open restores", widget.visible && widget._inputOpen);
                widget.closeInputSharedHudTools("visibility test");
                for (mode in ["ContainerMode", "InspectMode", "ExamineConfirmMode", "MessageMode", "InspectMode", "ContainerMode"]) {
                    MockGameData.setHudMode(mode);
                    check(mode + " hidden", !widget.visible && widget._hidden);
                    widget.openInput();
                    check(mode + " cannot capture input", !widget._inputOpen && !widget.visible);
                }
                MockGameData.setHudMode("All");
                check("temporary menu hide restores", widget.visible);
                widget.stopAutoHideTimer();
                widget.runAutoHideSafely();
                check("idle hides", !widget.visible);
                MockGameData.setHudMode("MessageMode");
                MockGameData.setHudMode("All");
                check("idle hide survives menu exit", !widget.visible);
                widget.parseAndRenderEvents('{"success":true,"events":[{"id":' + (id + 1)
                    + ',"kind":"chat.message","channel":"global","messageId":"visibility-2",'
                    + '"senderUserId":"fixture-peer","senderDisplayName":"Peer","body":"wake fixture"}]}');
                check("incoming message still wakes idle hide", widget.visible);
                widget.onSelectMenu("hidechat");
                MockGameData.setHudMode("MessageMode");
                MockGameData.setHudMode("All");
                check("F11 hide survives prompt exit", !widget.visible);
                widget._cfg.autoHideEnabled = true;
                widget.onSelectMenu("autohide");
                check("disabling auto-hide preserves manual hide", !widget.visible);
                widget.show();
                widget._cfg.hideKey = "DELETE";
                widget.handleUserEvent("DELETE", true);
                widget.handleUserEvent("DELETE", false);
                check("configured hide key", !widget.visible);
                widget.stopAutoHideTimer();
                flash.Lib.trace("VISIBILITY PASS " + provider);
            } catch (error:Dynamic) {
                timer.stop();
                widget.stopAutoHideTimer();
                flash.Lib.trace("VISIBILITY FAIL " + provider + " " + Std.string(error));
            }
        };
    }
}
