/** Exercises compiled production client and widget lifecycle; never opens a browser. */
@:access(FCMChatWidget)
class BrowserScenario {
    public static function start(widget:FCMChatWidget, provider:String):Void {
        var timer = new haxe.Timer(250);
        var attempts = 0;
        timer.run = function() {
            try {
                if (++attempts > 60) throw "setup timeout";
                if (!widget._connected) return;
                timer.stop();
                TestFcmBrowser.main();
                var calls:Array<String> = [];
                var raw:Dynamic = {call:function(verb:String, payload:String):String {
                    if (verb == "getRuntimeInfo" || StringTools.startsWith(verb, "browser.v1.")) calls.push(verb);
                    return switch (verb) {
                        case "getRuntimeInfo": '{"success":true,"capabilities":["zfe-browser-v1"]}';
                        case "browser.v1.beginAction": '{"success":true,"actionId":"action"}';
                        default: '{"success":true,"requestId":"request","state":"accepted","terminal":false}';
                    };
                }};
                var row = widget.buildFeedMessageRow({user:"Peer",body:"A friendly label",channel:"global",
                    color:"FFFFFF",starColor:"",tag:"",messageId:"",senderUserId:"",supporterStar:false,
                    pending:false,localSendId:"",pendingAt:0,sendAccepted:false,
                    linkUrl:"https://example.org/path?one=two#anchor"}, 500);
                widget._feedRows = [row]; widget._selectedRowIndex = 0;
                if (row.textField.text.indexOf("https://example.org/") < 0) throw "destination hidden";
                if (!row.textField.selectable || !row.textField.mouseEnabled || !row.view.mouseChildren || !widget._feedLayer.mouseChildren) throw "copy fallback disabled";
                if (calls.length != 0) throw "render opened link";
                widget.onInputSubmit(null);
                if (calls.length != 0) throw "cancel opened link";
                if (provider == "xscal") {
                    widget.activateSelectedLink();
                    if (widget._browser != null) throw "xscal must stay unsupported";
                }
                widget._api = FcmNativeApi.fromZfe(raw);
                widget.activateSelectedLink();
                if (calls.length != 3 || widget._browserTimer == null) throw "activation failed";
                widget.activateSelectedLink();
                if (calls.length != 3) throw "overlap retried";
                widget.forceReconnect("browser scenario");
                if (calls[calls.length-1] != "browser.v1.cancel" || widget._browserTimer != null) throw "reconnect leaked";
                widget._feedRows = [row]; widget._selectedRowIndex = 0;
                widget.activateSelectedLink();
                widget.rebuildPanel();
                if (widget._browser != null || widget._browserTimer != null || calls[calls.length-1] != "browser.v1.cancel") throw "rebuild leaked";
                widget._feedRows = [row]; widget._selectedRowIndex = 0;
                widget.activateSelectedLink();
                widget.shutdown();
                if (widget._browser != null || widget._browserTimer != null || calls[calls.length-1] != "browser.v1.cancel") throw "unload leaked";
                flash.Lib.trace("BROWSER PASS " + provider);
            } catch (error:Dynamic) {
                timer.stop(); widget.shutdown();
                flash.Lib.trace("BROWSER FAIL " + provider + " " + Std.string(error));
            }
        };
    }
}
