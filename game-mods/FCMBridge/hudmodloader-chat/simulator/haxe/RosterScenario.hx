/** Test-only driver of the real widget and native-provider mocks; never linked into production. */
@:access(FCMChatWidget)
@:access(FcmRoster)
@:access(FcmServerSession)
class RosterScenario {
    static function check(label:String, ok:Bool):Void { if (!ok) throw label; }

    public static function start(widget:FCMChatWidget, provider:String):Void {
        var attempts = 0;
        var timer = new haxe.Timer(250);
        timer.run = function():Void {
            try {
                if (++attempts > 80) throw "authenticated roster setup timed out";
                if (!widget._connected || widget._authState != "authenticated") return;
                widget.checkWorldId();
                drain(widget);
                if (!widget._serverSessionReady) return;
                timer.stop();
                check("actual native adapter matches requested provider", widget._api.provider == provider);
                run(widget);
                flash.Lib.trace("ROSTER-SCENARIO PASS " + provider + " preserved=tab,history,nonce controls=unchanged hop=clear,rebind expiry=leave mainMenu=leave");
            } catch (error:Dynamic) {
                timer.stop();
                flash.Lib.trace("ROSTER-SCENARIO FAIL " + provider + " " + Std.string(error));
            }
        };
    }

    static function drain(widget:FCMChatWidget):Void {
        // Exercise native max-16 polling, including ZFE's queued control completion frames.
        for (_ in 0...8) if (widget.runEventPollSafely() == 0) break;
    }

    static function map(names:Array<String>):Void {
        MockGameData.publish("MapMenuData", {MarkerData:[for (name in names)
            {markerType:"PlayerRemote", text:name, playerLevel:50}]});
    }

    static function serverRows(widget:FCMChatWidget):Int {
        var count = 0;
        for (record in widget._records) if (record.channel == "server") count++;
        return count;
    }

    static function run(widget:FCMChatWidget):Void {
        MockGameData.publish("TeamMarkers", {Markers:[{name:"HarnessPeer"}]});
        widget.checkWorldId();
        drain(widget);
        MockXscal.enqueueServerHistory(widget._serverSession.room);
        drain(widget);
        widget.selectChannel(5);
        check("confirmed room renders SERVER in attached tab field", widget._subTf != null
            && widget._subTf.parent == widget && widget._subTf.visible && widget._subTf.text.indexOf("SERVER") >= 0);
        check("setup has one Server history row", serverRows(widget) == 1);
        check("setup selected Server tab", widget._chanIdx == 5);
        var nonce = widget._serverSession.target();
        var room = widget._serverSession.room;
        var controls = MockXscal.serverControlCount;
        var leaves = MockXscal.leaveControlCount;
        var records = widget._records.copy();

        MockGameData.setHudMode("Loading");
        MockGameData.publish("TeamMarkers", {Markers:[]});
        widget.checkWorldId();
        MockGameData.setHudMode("All");
        widget.checkWorldId();
        check("same world preserves Server tab", widget._chanIdx == 5);
        check("same world preserves history objects", widget._records.length == records.length
            && widget._records[widget._records.length - 1] == records[records.length - 1]);

        MockGameData.publish("TeamMarkers", {Markers:[{name:"DifferentNearbyPeer"}]});
        widget.checkWorldId();
        check("nearby change preserves history", serverRows(widget) == 1);
        map([]);
        widget.checkWorldId();
        widget.checkWorldId();
        check("temporary empty primary preserves history", serverRows(widget) == 1);
        map(["HarnessPeer"]);
        widget.checkWorldId();
        check("recovered primary preserves binding", widget._serverSessionReady
            && widget._serverSession.target() == nonce && widget._serverSession.room == room);
        check("same world keeps SERVER rendered", widget._subTf.text.indexOf("SERVER") >= 0);
        check("no leave or redundant roster for fast travel", MockXscal.serverControlCount == controls);

        // Native xScal capture: the map stayed empty beyond the grace period while
        // public-team membership remained populated. Nearby lists changed independently.
        MockGameData.publish("PublicTeamsData", {publicTeams:[{members:[{playerName:"HarnessPeer"}]}]});
        map([]);
        MockGameData.setHudMode("Loading");
        widget.checkWorldId();
        MockGameData.setHudMode("All");
        widget._rosterSnapshots.emptySince = flash.Lib.getTimer() - 60000;
        widget.checkWorldId();
        check("empty map with populated public teams preserves Server beyond empty grace",
            widget._serverSessionReady && widget._serverSession.target() == nonce
            && widget._serverSession.room == room && serverRows(widget) == 1 && widget._chanIdx == 5
            && MockXscal.serverControlCount == controls);

        // Repeat the actual transition, including source recovery. Check each cycle so a
        // transient clear/rebind cannot be hidden by an eventually healthy final state.
        for (cycle in 0...3) {
            map(["HarnessPeer"]);
            widget.checkWorldId();
            check("recovered map takes priority cycle=" + cycle,
                widget._rosterSnapshots.sessionSource(flash.Lib.getTimer(), 30000,
                    widget._lastRosterSent) == "MapMenuData");
            MockGameData.setHudMode("Loading");
            map([]);
            MockGameData.publish("TeamMarkers", {Markers:[]});
            widget.checkWorldId();
            MockGameData.setHudMode("All");
            MockGameData.publish("PublicTeamsData", {publicTeams:[{members:[{playerName:"HarnessPeer"}]}]});
            widget._rosterSnapshots.emptySince = flash.Lib.getTimer() - 60000;
            widget.checkWorldId();
            drain(widget);
            check("overlapping public teams selected cycle=" + cycle,
                widget._rosterSnapshots.sessionSource(flash.Lib.getTimer(), 30000,
                    widget._lastRosterSent) == "PublicTeamsData"
                && widget._rosterSnapshots.emptySince == -1);
            check("repeated travel preserves attached selected tab and original rows cycle=" + cycle,
                widget._serverSessionReady && widget._serverSession.target() == nonce
                && widget._serverSession.room == room && widget._chanIdx == 5
                && widget._subTf.parent == widget && widget._subTf.visible
                && widget._subTf.text.indexOf("SERVER") >= 0 && serverRows(widget) == 1
                && widget._records.length == records.length
                && widget._records[widget._records.length - 1] == records[records.length - 1]
                && MockXscal.serverControlCount == controls && MockXscal.leaveControlCount == leaves);
            flash.Lib.trace("ROSTER-CYCLE PASS " + cycle + " source=PublicTeamsData history=preserved controls=unchanged");
        }

        // An old auxiliary name must not mask an actually disjoint full roster.
        MockGameData.publish("TeamMarkers", {Markers:[{name:"HarnessPeer"}]});
        map(["NewWorldPeer"]);
        widget.checkWorldId();
        check("world hop leaves exactly once", MockXscal.leaveControlCount == leaves + 1);
        check("world hop clears old rows and nonce", serverRows(widget) == 0
            && widget._serverSession.target() != nonce && !widget._serverSessionReady);
        widget.checkWorldId();
        drain(widget);
        check("world hop binds again", widget._serverSessionReady);
        check("world hop controls are bounded", MockXscal.serverControlCount == controls + 2);

        MockXscal.enqueueServerHistory(widget._serverSession.room);
        drain(widget);
        check("new room can receive history", serverRows(widget) == 1);
        map([]);
        widget.checkWorldId();
        check("empty grace initially keeps new room", serverRows(widget) == 1);
        // Advance only test-owned observation/confirmation timestamps, not a game clock.
        widget._rosterSnapshots.emptySince = flash.Lib.getTimer() - 60000;
        widget._serverSession.confirmedAt = flash.Lib.getTimer() - 60000;
        widget.checkWorldId();
        check("expired grace and lease still leave old room", serverRows(widget) == 0
            && !widget._serverSessionReady && MockXscal.leaveControlCount == leaves + 2);
        widget.checkWorldId();
        drain(widget);
        check("empty solo room can rebind after expiry", widget._serverSessionReady);
        MockXscal.enqueueServerHistory(widget._serverSession.room);
        drain(widget);
        MockGameData.publish("MenuStackData", {menuStackA:[{menuName:"MainMenu"}]});
        widget.checkWorldId();
        widget.checkWorldId();
        check("main menu leaves once and clears despite cached roster", !widget._serverSessionReady
            && serverRows(widget) == 0 && MockXscal.leaveControlCount == leaves + 3);
    }
}
