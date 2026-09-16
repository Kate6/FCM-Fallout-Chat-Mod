/** Real invisible bridge + the same xScal/ZFE mock transports as the visible HUD. */
@:access(FCMServerBridge)
@:access(FcmBridgeState)
@:access(FcmRoster)
class BridgeRosterScenario {
    static function check(label:String, ok:Bool):Void { if (!ok) throw label; }
    public static function start(bridge:FCMServerBridge, provider:String):Void {
        var attempts = 0;
        var timer = new haxe.Timer(250);
        timer.run = function():Void {
            try {
                if (++attempts > 80) throw "bridge setup timed out";
                if (!bridge.authenticated) return;
                step(bridge);
                if (bridge.state.session.room.length == 0) return;
                timer.stop();
                check("actual adapter matches request", bridge.api.provider == provider);
                run(bridge);
                bridge.shutdown();
                check("owned timers and subscriptions released", bridge.disposed
                    && !bridge.timer.running && MockBridgeGameData.subscriptions() == 0);
                flash.Lib.trace("BRIDGE-ROSTER PASS " + provider + " same=preserved hop=rebound expiry=left mainMenu=left teardown=clean");
            } catch (error:Dynamic) {
                timer.stop();
                bridge.shutdown();
                flash.Lib.trace("BRIDGE-ROSTER FAIL " + provider + " " + Std.string(error));
            }
        };
    }
    static function step(bridge:FCMServerBridge):Void {
        bridge.world(flash.Lib.getTimer());
        for (_ in 0...4) bridge.poll(flash.Lib.getTimer());
    }
    static function run(bridge:FCMServerBridge):Void {
        var nonce = bridge.state.session.requestId;
        var room = bridge.state.session.room;
        var controls = MockXscal.serverControlCount;
        var leaves = MockXscal.leaveControlCount;
        check("bridge owns no chat UI or editor", bridge.numChildren == 0 && !SharedHUDTools.hasActiveEditor());
        MockBridgeGameData.menu("LoadingMenu");
        MockBridgeGameData.publish("TeamMarkers", {Markers:[]});
        step(bridge);
        check("loading preserves confirmed session", bridge.state.session.requestId == nonce
            && bridge.state.session.room == room && MockXscal.serverControlCount == controls);
        MockBridgeGameData.menu("");
        MockBridgeGameData.publish("TeamMarkers", {Markers:[{name:"DifferentNearbyPeer"}]});
        step(bridge);
        check("auxiliary change preserves session", bridge.state.session.requestId == nonce);
        MockBridgeGameData.map([]);
        step(bridge);
        MockBridgeGameData.map(["PeerB", "PeerA"]);
        step(bridge);
        check("empty then same reordered roster preserves room without controls", bridge.state.session.room == room
            && bridge.state.session.requestId == nonce && MockXscal.serverControlCount == controls);
        MockBridgeGameData.publish("PublicTeamsData", {publicTeams:[{members:[
            {playerName:"PeerA"}, {playerName:"PeerB"}]}]});
        MockBridgeGameData.map([]);
        step(bridge);
        bridge.state.roster.emptySince = flash.Lib.getTimer() - 30000;
        step(bridge);
        check("empty map with populated public teams preserves bridge beyond empty grace",
            bridge.state.session.room == room && bridge.state.session.requestId == nonce
            && MockXscal.serverControlCount == controls);
        for (cycle in 0...3) {
            MockBridgeGameData.map(["PeerB", "PeerA"]);
            step(bridge);
            check("recovered map takes priority cycle=" + cycle,
                bridge.state.roster.sessionSource(flash.Lib.getTimer(), 30000,
                    bridge.state.lastNames) == "MapMenuData");
            MockBridgeGameData.menu("LoadingMenu");
            MockBridgeGameData.map([]);
            MockBridgeGameData.publish("TeamMarkers", {Markers:[]});
            step(bridge);
            check("loading does not leave or rebind cycle=" + cycle,
                bridge.state.session.requestId == nonce && bridge.state.session.room == room
                && MockXscal.serverControlCount == controls && MockXscal.leaveControlCount == leaves);
            MockBridgeGameData.menu("");
            MockBridgeGameData.publish("PublicTeamsData", {publicTeams:[{members:[
                {playerName:"PeerB"}, {playerName:"PeerA"}]}]});
            bridge.state.roster.emptySince = flash.Lib.getTimer() - 30000;
            step(bridge);
            check("overlapping public teams selected cycle=" + cycle,
                bridge.state.roster.sessionSource(flash.Lib.getTimer(), 30000,
                    bridge.state.lastNames) == "PublicTeamsData"
                && bridge.state.roster.emptySince == -1);
            check("repeated travel preserves invisible binding without controls cycle=" + cycle,
                bridge.state.session.room == room && bridge.state.session.requestId == nonce
                && MockXscal.serverControlCount == controls && MockXscal.leaveControlCount == leaves
                && bridge.numChildren == 0 && !SharedHUDTools.hasActiveEditor());
            flash.Lib.trace("BRIDGE-CYCLE PASS " + cycle + " source=PublicTeamsData nonce=preserved controls=unchanged");
        }
        MockBridgeGameData.publish("TeamMarkers", {Markers:[{name:"PeerA"}]});
        MockBridgeGameData.map(["NewWorldPeer"]);
        step(bridge);
        check("genuine hop leaves once and rebinds", MockXscal.leaveControlCount == leaves + 1
            && bridge.state.session.requestId != nonce && bridge.state.session.room.length > 0
            && MockXscal.serverControlCount == controls + 2);
        var nextNonce = bridge.state.session.requestId;
        MockBridgeGameData.menu("LoadingMenu");
        bridge.state.observedAt = flash.Lib.getTimer() - 30000;
        step(bridge);
        check("long loading expires without renewing old world", MockXscal.leaveControlCount == leaves + 2
            && bridge.state.session.room == "" && bridge.sentRequest == "");
        MockBridgeGameData.menu("");
        MockBridgeGameData.map(["NewWorldPeer"]); // Explicit fresh push after expired evidence.
        step(bridge);
        check("fresh post-expiry roster binds with new nonce", bridge.state.session.requestId != nextNonce
            && bridge.state.session.room.length > 0);
        MockBridgeGameData.menu("MainMenu");
        step(bridge);
        step(bridge);
        check("main menu leaves exactly once", MockXscal.leaveControlCount == leaves + 3
            && bridge.state.session.room == "");
        MockBridgeGameData.push("MenuStackData", {isTest:false, dataReady:true, data:{menuStackA:[]}});
        MockBridgeGameData.push("MapMenuData", {isTest:false, dataReady:true,
            data:{MarkerData:[{markerType:"PlayerRemote", text:"FreshEventPeer"}]}});
        step(bridge);
        check("fresh event wins over stale getter", bridge.state.fresh(flash.Lib.getTimer())
            && bridge.state.names(flash.Lib.getTimer()).join("|") == "FreshEventPeer"
            && bridge.state.session.room.length > 0);
        var freshNonce = bridge.state.session.requestId;
        var freshControls = MockXscal.serverControlCount;
        SharedHUDTools.selectMenu("retry");
        SharedHUDTools.selectMenu("retry");
        check("menu reconnect never calls transport or clears healthy room inline",
            bridge.connected && bridge.state.session.requestId == freshNonce
            && MockXscal.serverControlCount == freshControls);
        bridge.tick(null);
        check("coalesced refresh keeps healthy session", bridge.connected
            && bridge.state.session.requestId == freshNonce);
        var nested = false;
        MockBridgeGameData.onRead = function():Void {
            check("data callback runs within guarded tick", bridge.tickBusy);
            bridge.tick(null);
            nested = true;
        };
        bridge.nextWorld = 0;
        bridge.tick(null);
        check("nested data delivery returns and releases guard", nested && !bridge.tickBusy);
        var staleAt = flash.Lib.getTimer() - 30000;
        for (entry in bridge.pushes) entry.at = staleAt;
        bridge.state.observedAt = staleAt;
        bridge.state.roster = new FcmRoster();
        step(bridge);
        check("expired divergent event cannot be renewed by stale getter", bridge.state.session.room == "");
        MockBridgeGameData.push("MenuStackData", {isTest:true, dataReady:true, data:{menuStackA:[]}});
        step(bridge);
        check("test-provider event cannot keep world active", !bridge.state.inWorld && bridge.sentRequest == "");
        flash.Lib.trace("BRIDGE-EVENTS PASS fresh-push=preferred retry=deferred test-provider=rejected");
        var menuControls = MockXscal.serverControlCount;
        var menuNonce = bridge.state.session.requestId;
        var menuRefresh = bridge.refreshRequested;
        MockBridgeGameData.onRead = function():Void { throw "menu must not read native providers"; };
        var items = SharedHUDTools.inspectMenu();
        check("diagnostic menu uses cached state without native reads or control mutation",
            MockBridgeGameData.onRead != null && MockXscal.serverControlCount == menuControls
            && bridge.state.session.requestId == menuNonce && bridge.refreshRequested == menuRefresh);
        MockBridgeGameData.onRead = null;
        check("menu includes tested build and precise gate", [for (item in items) item.label].indexOf(
            "Bridge " + FCMServerBridge.VERSION + " - " + bridge.api.provider) >= 0
            && [for (item in items) item.label].indexOf("Menu - test provider") >= 0);
        var details = 0;
        for (item in items) if (StringTools.startsWith(item.id, "detail")) {
            details++;
            check("diagnostic rows are bounded inert fixed labels", !item.enabled && item.label.length < 64
                && item.label.indexOf("Peer") < 0 && item.label.indexOf(menuNonce) < 0);
        }
        check("all eight bounded diagnostic rows present", details == 8);
        flash.Lib.trace("BRIDGE-DIAGNOSTICS PASS cached=read-only labels=private-data-free");
        // Throw actual AVM2 Error objects at different boundaries. The outer getter's
        // phase must survive a nested callback that fails inside name processing.
        bridge.state.menu(FcmHudRosterReader.menu(new MockBridgeProvider({menuStackA:[]})));
        // Std.string swallows anonymous-object toString failures on Flash; a
        // sealed instance instead exercises the actual native conversion edge.
        var unreadableName = new ThrowingBridgeName();
        var conversionFailed = false;
        try { Std.string(unreadableName); }
        catch (error:Dynamic) { conversionFailed = FcmBridgeRead.errorCode(error) == "E1010"; }
        check("processing fixture throws an AVM2 error before use", conversionFailed);
        MockBridgeGameData.onRead = function():Void {
            try { bridge.observe("PlayerListData", true, new MockBridgeProvider([{displayName:unreadableName}])); }
            catch (_:Dynamic) {}
        };
        MockBridgeGameData.readErrorKey = "MapMenuData";
        try { bridge.observe("MapMenuData", false); } catch (_:Dynamic) {}
        MockBridgeGameData.readErrorKey = "";
        var reasons = bridge.state.diagnostics(flash.Lib.getTimer());
        check("getter failure remains distinct from nested processing failure - " + reasons.join(" / "),
            reasons.indexOf("Map - getter E1014") >= 0 && reasons.indexOf("Player list - unreadable entries") >= 0);
        var retried = false;
        MockBridgeGameData.onRead = function():Void { retried = true; };
        bridge.observe("MapMenuData", false);
        check("failed source backs off before another getter", !retried && bridge.readRetries.length == 1);
        MockBridgeGameData.onRead = null;
        check("failed observations cannot create room membership", !bridge.state.fresh(flash.Lib.getTimer())
            && bridge.state.session.requestId == menuNonce && MockXscal.serverControlCount == menuControls);
        // The production template parser must read the accessor-backed AVM2 Error
        // object too, without publishing any message/stack beyond its class token.
        var classAttempt = new FcmBridgeRead();
        classAttempt.step = "processor entry";
        bridge.state.readException("MapMenuData", classAttempt,
            new flash.errors.Error("Error #1014: Class haxe.iterators::ArrayIterator could not be found.", 1014));
        items = SharedHUDTools.inspectMenu();
        check("menu identifies a simulated missing class", [for (item in items) item.label].indexOf(
            "Missing class - haxe.iterators::ArrayIterator") >= 0);
        bridge.state.readException("MapMenuData", classAttempt,
            new flash.errors.Error("Class Array could not be found.\nPrivate stack payload", 1014));
        items = SharedHUDTools.inspectMenu();
        check("noncanonical missing-class text stays private", [for (item in items) item.label].indexOf(
            "Missing class - not reported") >= 0);
        check("class diagnostics cannot create membership", !bridge.state.fresh(flash.Lib.getTimer())
            && bridge.state.session.requestId == menuNonce && MockXscal.serverControlCount == menuControls);
        for (retry in bridge.readRetries) retry.after = 0;
        bridge.observe("MapMenuData", true, new MockBridgeProvider({MarkerData:[{markerType:"PlayerRemote",text:"RecoveredPeer"}]}));
        check("successful recovery clears source backoff", bridge.readRetries.length == 0);
        bridge.detach();
        MockBridgeGameData.subscribeErrorKey = "VoiceChatAreaData";
        bridge.subscribe("VoiceChatAreaData");
        MockBridgeGameData.subscribeErrorKey = "";
        items = SharedHUDTools.inspectMenu();
        check("subscription failure is visible without leaking error messages", bridge.callbacks.length == 0
            && [for (item in items) item.label].indexOf("Subscriptions - 0 of 8 E1006") >= 0);
        for (item in items) check("exception text is never rendered", item.label.indexOf("Private") < 0);
        flash.Lib.trace("BRIDGE-ERRORS PASS getter=E1014 nested-names=rejected subscribe=E1006");
    }
}

private class ThrowingBridgeName {
    public function new() {}
    public function toString():String {
        throw new flash.errors.Error("Private roster payload", 1010);
    }
}
