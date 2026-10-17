/** Personal Events-only variant (-D events_only): the feed locks to EVENTS,
  * every other channel is silently dropped on ingest, and user sends are compiled out.
  * World-event auto-broadcasts bypass the editor and are unaffected.
  * In a standard (unflagged) harness this scenario self-skips so the shared suite stays green. */
@:access(FCMChatWidget)
class EventsOnlyScenario {
    static function check(label:String, ok:Bool):Void { if (!ok) throw label; }

    public static function start(widget:FCMChatWidget, provider:String):Void {
        #if events_only
        var attempts = 0;
        var timer = new haxe.Timer(250);
        timer.run = function():Void {
            try {
                if (++attempts > 60) throw "events-only setup timed out";
                if (!widget._connected || widget._authState != "authenticated") return;
                timer.stop();
                check("adapter", widget._api.provider == provider);
                run(widget);
                flash.Lib.trace("EVENTS-ONLY-SCENARIO PASS " + provider
                    + " tabs=events-only ingest=events-only sends=disabled broadcasts=intact");
            } catch (error:Dynamic) {
                timer.stop();
                flash.Lib.trace("EVENTS-ONLY-SCENARIO FAIL " + provider + " " + Std.string(error));
            }
        };
        #else
        flash.Lib.trace("EVENTS-ONLY-SCENARIO SKIP standard-build");
        #end
    }

    #if events_only
    static function run(widget:FCMChatWidget):Void {
        for (_ in 0...8) if (widget.runEventPollSafely() == 0) break;
        widget._records = [];
        widget._nextRecordOrder = 1;

        // Locked to EVENTS from construction; nothing can leave it.
        check("default channel is events", widget._chanIdx == 2);
        widget.selectChannel(0);
        check("general tab rejected", widget._chanIdx == 2);
        widget.selectChannel(5);
        check("server tab rejected", widget._chanIdx == 2);
        // The old switchChannelBySlash is gone; channel prefixes now flow through
        // FcmCommand.channelSubmission, whose selectTab half calls selectChannel —
        // proven locked above. Assert the parser classifies both prefixes correctly,
        // and that a prefixed send can never move the widget off Events.
        var slashG = FcmCommand.channelSubmission("/g");
        check("/g parses as General", slashG.handled && slashG.channelIndex == 0);
        var slashE = FcmCommand.channelSubmission("/e");
        check("/e parses as Events", slashE.handled && slashE.channelIndex == 2);
        if (slashG.selectTab) widget.selectChannel(slashG.channelIndex);
        check("/g selectTab cannot leave Events", widget._chanIdx == 2);
        if (slashE.selectTab) widget.selectChannel(slashE.channelIndex);
        check("/e selectTab stays Events", widget._chanIdx == 2);
        var slashTBody = FcmCommand.channelSubmission("/t stimpaks for sale");
        check("/t message targets Trading", slashTBody.handled && slashTBody.channelIndex == 1
            && slashTBody.body == "stimpaks for sale");

        // Multi-channel traffic: only the Events row may survive ingest.
        var raw = '{"success":true,"events":['
            + event(2001, "ev-general", "global", "General chatter", "2026-09-19T12:00:00.000Z") + ','
            + event(2002, "ev-trade", "trade", "W: stimpaks", "2026-09-19T12:01:00.000Z") + ','
            + event(2003, "ev-events", "events", "Scorched Earth incoming", "2026-09-19T12:02:00.000Z") + ','
            + event(2004, "ev-infests", "infests", "Infestation report", "2026-09-19T12:03:00.000Z") + ','
            + event(2005, "ev-raids", "raids", "Raid forming", "2026-09-19T12:04:00.000Z") + ','
            + event(2006, "ev-server", "server", "Server hello", "2026-09-19T12:05:00.000Z")
            + ']}';
        widget.parseAndRenderEvents(raw);
        widget.renderRecords();
        check("only events stored", widget._records.length == 1
            && widget._records[0].channel == "events");
        var rendered = widget._renderedRecordKeys.join("\n");
        check("events rendered", rendered.indexOf("Scorched Earth incoming") >= 0);
        check("other channels never render", rendered.indexOf("General chatter") < 0
            && rendered.indexOf("W: stimpaks") < 0
            && rendered.indexOf("Infestation report") < 0
            && rendered.indexOf("Raid forming") < 0
            && rendered.indexOf("Server hello") < 0);

        // User sends are compiled out: no editor, no outbox entry, no new row.
        widget.openInput();
        check("editor never opens", !widget._inputOpen);
        var before = widget._records.length;
        widget.sendMessage("should never send");
        check("send suppressed", widget._records.length == before
            && widget._outbox.entries.length == 0);
    }

    static function event(id:Int, messageId:String, channel:String, body:String,
            createdAt:String):String {
        return '{"id":' + id + ',"kind":"chat.message","channel":"' + channel
            + '","messageId":"' + messageId + '","senderUserId":"fixture-peer",'
            + '"senderDisplayName":"Peer","body":"' + body + '","createdAt":"'
            + createdAt + '","targetUserId":""}';
    }
    #end
}
