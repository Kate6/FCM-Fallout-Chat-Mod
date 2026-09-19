/** Regression for late Server-history replay: General slots overlapping rows by time, Server keeps all. */
@:access(FCMChatWidget)
@:access(FcmServerSession)
class ServerHistoryChronologyScenario {
    static function check(label:String, ok:Bool):Void { if (!ok) throw label; }

    public static function start(widget:FCMChatWidget, provider:String):Void {
        var attempts = 0;
        var timer = new haxe.Timer(250);
        timer.run = function():Void {
            try {
                if (++attempts > 60) throw "history chronology setup timed out";
                if (!widget._connected || widget._authState != "authenticated") return;
                timer.stop();
                check("adapter", widget._api.provider == provider);
                run(widget);
                flash.Lib.trace("SERVER-HISTORY-CHRONOLOGY PASS " + provider
                    + " general=overlap-slotted,old-hidden server=complete,chronological");
            } catch (error:Dynamic) {
                timer.stop();
                flash.Lib.trace("SERVER-HISTORY-CHRONOLOGY FAIL " + provider + " " + Std.string(error));
            }
        };
    }

    static function run(widget:FCMChatWidget):Void {
        for (_ in 0...8) if (widget.runEventPollSafely() == 0) break;
        widget._records = [];
        widget._nextRecordOrder = 1;
        widget._chanIdx = 0;

        var room = "r:00000000-0000-4000-8000-000000000002";
        widget._serverSession.begin("history-chronology");
        check("room confirmation", widget._serverSession.accept(
            FcmServerSession.READY_PREFIX + "history-chronology|" + room, flash.Lib.getTimer()));
        widget.setServerSessionReady(true, "");

        var historyCarrier = "FCMHUD/1;h=" + StringTools.urlEncode(room);
        var raw = '{"success":true,"events":['
            + event(1001, "global-before", "global", "General before", "2026-09-19T12:00:00.000Z", "") + ','
            + event(1002, "global-after", "global", "General after", "2026-09-19T12:10:00.000Z", "") + ','
            + event(1003, "server:r:00000000-0000-4000-8000-000000000001:91", "server",
                "Old Server backlog", "2026-09-19T11:00:00.000Z", historyCarrier) + ','
            + event(1004, "server:r:00000000-0000-4000-8000-000000000001:92", "server",
                "Overlapping Server replay", "2026-09-19T12:05:00.000Z", historyCarrier) + ','
            + event(1005, "server:" + room + ":93", "server",
                "Live Server row", "2026-09-19T12:07:00.000Z", "")
            + ']}';
        widget.parseAndRenderEvents(raw);
        widget.renderRecords();

        var general = widget._renderedRecordKeys.join("\n");
        check("General hides older replay", general.indexOf("Old Server backlog") < 0);
        checkOrder("General chronology", general,
            ["General before", "Overlapping Server replay", "Live Server row", "General after"]);

        widget.selectChannel(5);
        var server = widget._renderedRecordKeys.join("\n");
        checkOrder("Server chronology", server,
            ["Old Server backlog", "Overlapping Server replay", "Live Server row"]);
        check("Server excludes General rows", server.indexOf("General before") < 0
            && server.indexOf("General after") < 0);
    }

    static function event(id:Int, messageId:String, channel:String, body:String,
            createdAt:String, targetUserId:String):String {
        return '{"id":' + id + ',"kind":"chat.message","channel":"' + channel
            + '","messageId":"' + messageId + '","senderUserId":"fixture-peer",'
            + '"senderDisplayName":"Peer","body":"' + body + '","createdAt":"'
            + createdAt + '","targetUserId":"' + targetUserId + '"}';
    }

    static function checkOrder(label:String, value:String, expected:Array<String>):Void {
        var previous = -1;
        for (needle in expected) {
            var at = value.indexOf(needle);
            check(label + " missing " + needle, at >= 0);
            check(label + " order at " + needle, at > previous);
            previous = at;
        }
    }
}
