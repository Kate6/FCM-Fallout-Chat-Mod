class TestFcmHudRosterReader {
    static var checks = 0;
    static function check(ok:Bool, label:String):Void { checks++; if (!ok) throw label; }
    static function ready(data:Dynamic):Dynamic return {data:data, dataReady:true, isTest:false};
    static function main():Void {
        var reader = new FcmHudRosterReader();
        var peer = {displayName:" Peer|A<title>"};
        var rows = [peer, {displayName:"Self"}, {displayName:"PeerA"}];
        for (key in ["PlayerListData", "PartyMenuList", "TeamMarkers", "VoiceChatAreaData", "MapMenuData", "PublicTeamsData"]) {
            var data:Dynamic = switch key {
                case "TeamMarkers": {Markers:rows};
                case "VoiceChatAreaData": {participants:rows};
                case "MapMenuData": {MarkerData:[{markerType:"PlayerRemote",text:"PeerA"}, {markerType:"Location",text:"NotAPlayer"}]};
                case "PublicTeamsData": {publicTeams:[{members:[{playerName:"PeerA"}, {playerName:"Self"}]}]};
                default: rows;
            };
            var observation = reader.provider(key, ready(data), "Self", 12);
            check(observation.reason == "" && observation.names.join("|") == "PeerA", key + " uses common normalization");
            check(observation.at == 12 && observation.revision > 0, key + " retains observation metadata");
        }
        for (length in [Math.NaN, Math.POSITIVE_INFINITY, -1.0, 1.5, 2049.0]) {
            check(reader.provider("PlayerListData", ready({length:length}), "Self", 0).reason == "invalid list", "reject invalid lengths");
        }
        check(reader.provider("PlayerListData", ready({length:"2"}), "Self", 0).reason == "invalid list", "do not coerce length");
        check(reader.provider("Unknown", ready([]), "Self", 0).reason == "unknown source", "source allowlist");
        check(reader.provider("PlayerListData", {data:rows, dataReady:false}, "Self", 0).reason == "not ready", "unready provider");
        check(reader.provider("PlayerListData", {data:rows, dataReady:true,isTest:true}, "Self", 0).reason == "test provider", "test provider");
        check(reader.provider("PlayerListData", null, "Self", 0).reason == "missing provider", "missing provider");
        var many = [for (i in 0...200) {name:"Peer" + i}];
        check(reader.provider("PlayerListData", ready(many), "Self", 0).names.length == 24, "bounded peers");
        var data = ready(rows);
        var first = reader.provider("PlayerListData", data, "Self", 20);
        var same = reader.provider("PlayerListData", data, "Self", 21);
        check(first.revision == same.revision, "reread is not new cache evidence");
        check(same.at == first.at, "unchanged polling cannot extend observation age");
        peer.displayName = "Changed";
        check(first.names.join("|") == "PeerA", "native mutation cannot change an emitted observation");
        var changed = reader.provider("PlayerListData", data, "Self", 22);
        check(changed.revision != same.revision && changed.names.indexOf("Changed") >= 0, "in-place changes advance revision");
        var push = reader.provider("PlayerListData", data, "Self", 23, true);
        check(push.revision != changed.revision, "validated fresh push advances revision");
        check(push.at == 23, "a fresh push renews observation time");
        reader.clear();
        check(reader.provider("PlayerListData", data, "Self", 24).revision > push.revision, "detach cannot reuse revision");
        var control = String.fromCharCode(0);
        check(FcmHudRosterReader.cleanName(" Peer" + control + "A\\u0000u0000|<title>") == "PeerA", "native and escaped NUL sanitization");
        check(FcmHudRosterReader.cleanName(StringTools.lpad("A", "A", 200)).length == 64, "name length bound");
        check(FcmHudRosterReader.menu(ready({menuStackA:[]})).allowed, "ready empty menu proves allowed");
        check(!FcmHudRosterReader.menu(ready({})).allowed, "placeholder cannot prove allowed");
        check(!FcmHudRosterReader.menu(ready({menuStackA:[{menuName:"MainMenu"}]})).allowed, "main menu denied");
        check(FcmHudRosterReader.menu(ready({menuStackA:[{menuName:"LoadingMenu"}]})).loading, "loading decoded separately");
        Sys.println("PASS FcmHudRosterReader: " + checks + " checks");
    }
}
