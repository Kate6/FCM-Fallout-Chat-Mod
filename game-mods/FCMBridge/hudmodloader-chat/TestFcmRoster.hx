class TestFcmRoster {
    static function check(label:String, ok:Bool):Void { if (!ok) throw label; }
    public static function main():Void {
        var map:Dynamic = {MarkerData: [
            {markerType:"PlayerLocal", text:"Local", playerLevel:10},
            {markerType:"PlayerRemote", text:"Alice<title>", playerLevel:20},
            {markerType:"Location", text:"Not a player", playerLevel:0},
            {markerType:"PlayerRemote", text:"Bob", playerLevel:30}]};
        check("map roster excludes local and non-player markers",
            FcmRoster.readNames("MapMenuData", map, "Local").join("|") == "Alice|Bob");
        check("public team roster uses nested members",
            FcmRoster.readNames("PublicTeamsData", {publicTeams:[{members:[
                {playerName:"Alice"}, {playerName:"Local"}, {playerName:"Carol"}]}]}, "Local").join("|") == "Alice|Carol");
        check("restored map reader accepts a valid empty list", FcmRoster.readNames("MapMenuData", {MarkerData:[]}, "Local").length == 0);
        check("restored map reader rejects a missing list", FcmRoster.readNames("MapMenuData", {}, "Local") == null);
        check("restored map reader rejects coerced lengths", FcmRoster.readNames("MapMenuData", {MarkerData:{length:"1"}}, "Local") == null);
        check("restored map reader rejects unbounded lengths", FcmRoster.readNames("MapMenuData", {MarkerData:{length:2049}}, "Local") == null);
        check("restored team reader rejects missing member lists", FcmRoster.readNames("PublicTeamsData", {publicTeams:[{}]}, "Local") == null);
        for (key in ["PlayerListData", "PartyMenuList", "TeamMarkers", "VoiceChatAreaData", "MapMenuData", "PublicTeamsData"]) {
            var data:Dynamic = switch key {
                case "TeamMarkers": {Markers:[{displayName:"Peer"}, {displayName:"Local", isLocal:true}]};
                case "VoiceChatAreaData": {participants:[{name:"Peer"}, {name:"Local", isSelf:true}]};
                case "MapMenuData": {MarkerData:[{markerType:"PlayerRemote", text:"Peer"}]};
                case "PublicTeamsData": {publicTeams:[{members:[{playerName:"Peer"}, {playerName:"Local"}]}]};
                default: [{displayName:"Peer"}, {displayName:"Local", isLocalPlayer:true}];
            };
            var native = FcmRoster.readNative(key, data, "Local");
            check("native child decoder accepts " + key, native.valid && native.skipped == 0 && native.names.join("|") == "Peer");
            check("valid decode finishes phase " + key, FcmRoster.readPhase == "decoder complete");
        }
        var malformed = FcmRoster.readNative("PlayerListData", {length:"2"}, "Local");
        check("native child decoder rejects a coerced length", !malformed.valid && malformed.names.length == 0);
        check("invalid length retains its failure phase", FcmRoster.readPhase == "length type");
        check("native child decoder strips wire-unsafe roster decoration",
            FcmRoster.readNative("PlayerListData", [{displayName:" Peer|A<title>"}], "Local").names.join("|") == "PeerA");
        check("main menu is an explicit world boundary", FcmRoster.isMainMenu({menuStackA:[{menuName:"MainMenu"}]}));
        check("map menu is not a world boundary", !FcmRoster.isMainMenu({menuStackA:[{menuName:"MapMenu"}]}));
        var roster = new FcmRoster();
        check("new provider has no prior snapshot", roster.replace("players", ["B", "A"], 0) == null);
        roster.replace("team", ["A", "C"], 10);
        check("providers merge without duplicates", roster.fresh(20, 100).join("|") == "A|B|C");
        check("replacement returns provider's own snapshot", roster.replace("players", [], 30).join("|") == "B|A");
        check("empty replacement removes that provider's old names", roster.fresh(40, 100).join("|") == "A|C");
        roster.replace("players", ["D"], 90);
        check("expired auxiliary provider cannot contaminate next world", roster.fresh(120, 100).join("|") == "D");
        check("expired provider is forgotten", roster.replace("team", ["E"], 121) == null);
        var names = [for (i in 0...30) "Player" + i];
        roster.replace("players", names, 130);
        names.push("MUTATED");
        check("union covers a public world and is bounded", roster.fresh(131, 100).length == 24);
        check("provider cannot mutate retained snapshot", roster.fresh(131, 100).indexOf("MUTATED") < 0);
        var session = new FcmRoster();
        session.replace("MapMenuData", ["A", "B"], 0);
        session.replace("TeamMarkers", ["A"], 0);
        session.replace("TeamMarkers", [], 10);
        check("empty auxiliary snapshot preserves full roster", session.sessionNames(10, 100).join("|") == "A|B");
        session.replace("TeamMarkers", ["NearbyElsewhere"], 20);
        check("disjoint nearby players do not replace world roster", session.sessionNames(20, 100).join("|") == "A|B");
        session.replace("MapMenuData", ["C", "D"], 30);
        check("stale auxiliaries cannot conceal disjoint world roster", session.sessionNames(30, 100).join("|") == "C|D");
        session.replace("MapMenuData", [], 40);
        check("empty primary does not revive stale auxiliary names", session.sessionNames(40, 100).length == 0);
        session.replace("PlayerListData", ["E"], 130);
        check("fresh player list is fallback when map expires", session.sessionNames(141, 100).join("|") == "E");
        session.replace("TeamMarkers", ["F"], 240);
        check("auxiliary fallback works without either full roster", session.sessionNames(241, 100).join("|") == "F");
        check("all expired snapshots are absent", session.sessionNames(341, 100).length == 0);
        check("initial empty solo roster is not delayed", !session.waitForRoster("", [], 0, 100));
        check("transient empty starts grace", session.waitForRoster("A|B", [], 10, 100));
        check("repeated empties do not restart grace", session.waitForRoster("A|B", [], 109, 100));
        check("empty grace has exact bounded expiry", !session.waitForRoster("A|B", [], 110, 100));
        check("recovered roster cancels grace", !session.waitForRoster("A|B", ["B", "A"], 111, 100));
        check("next transition gets its own grace", session.waitForRoster("A|B", [], 200, 100));
        check("disjoint nonempty roster is never delayed", !session.waitForRoster("A|B", ["C"], 201, 100));
        var travel = new FcmRoster();
        travel.replace("MapMenuData", [], 100);
        travel.replace("PublicTeamsData", ["PeerA", "PeerB", "PeerC"], 100);
        check("empty map must not starve a populated public-team roster",
            travel.sessionNames(100, 60000).join("|") == "PeerA|PeerB|PeerC");
        check("overlapping public teams preserve existing membership with empty map",
            travel.sessionNames(100, 60000, "peera|peerb").join("|") == "PeerA|PeerB|PeerC");
        check("source diagnostics match public-team selection",
            travel.sessionSource(100, 60000, "PeerA") == "PublicTeamsData");
        check("disjoint cached public teams cannot bypass an empty primary",
            travel.sessionNames(100, 60000, "NewWorldPeer").length == 0);
        travel.replace("PlayerListData", ["UnrelatedCachedPeer"], 100);
        check("overlapping public teams can follow an empty map and disjoint player cache",
            travel.sessionNames(100, 60000, "PeerA").join("|") == "PeerA|PeerB|PeerC");
        travel.replace("MapMenuData", ["NewWorldPeer"], 101);
        check("nonempty primary still proves disjoint boundary despite old public teams",
            travel.sessionNames(101, 60000, "PeerA").join("|") == "NewWorldPeer");
        travel.replace("MapMenuData", [], 60101);
        check("expired public teams do not refresh from an empty primary",
            travel.sessionNames(60101, 60000, "PeerA").length == 0);
        travel.replace("PublicTeamsData", [], 60101);
        travel.replace("TeamMarkers", ["PeerA"], 60101);
        check("empty world surfaces cannot be overridden by nearby-only overlap",
            travel.sessionNames(60101, 60000, "PeerA").length == 0);
        trace("FcmRoster tests passed");
    }
}
