/** Proves late authoritative cosmetics repaint only retained rows from the local account. */
@:access(FCMChatWidget)
class CosmeticsHistoryScenario {
    static function check(label:String, ok:Bool):Void { if (!ok) throw label; }

    public static function start(widget:FCMChatWidget, provider:String):Void {
        try {
            widget._linkedUserId = "linked-local";
            widget._relayUserId = "relay-local";
            widget._userId = "native-local";
            widget._records = [
                record("old-linked", "linked-local"),
                record("old-relay", "relay-local"),
                record("same-name-foreign", "linked-foreign"),
            ];

            widget.rememberOwnCosmetics("VIP", true, "#70F835", "#58FDFD", "linked-local");

            for (index in [0, 1]) {
                var own = widget._records[index];
                check("own history receives current cosmetics", own.supporterStar
                    && own.starColor == "#70F835" && own.color == "#58FDFD" && own.tag == "VIP");
            }
            var foreign = widget._records[2];
            check("same-name foreign history remains unchanged", !foreign.supporterStar
                && foreign.starColor == "" && foreign.color == "" && foreign.tag == "");
            flash.Lib.trace("COSMETICS-HISTORY PASS " + provider
                + " own=backfilled foreign=unchanged identity=id-only");
        } catch (error:Dynamic) {
            flash.Lib.trace("COSMETICS-HISTORY FAIL " + provider + " " + Std.string(error));
        }
    }

    static function record(body:String, senderUserId:String):Dynamic {
        return {
            color:"", channel:"global", user:"Devotek", tag:"", supporterStar:false,
            starColor:"", body:body, messageId:"message-" + body,
            senderUserId:senderUserId, pending:false, localSendId:"", pendingAt:0,
            sendAccepted:false,
        };
    }
}
