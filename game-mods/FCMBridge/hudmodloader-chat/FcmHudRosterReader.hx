/** Background bridge adapter for the native-accepted 2.10.106+ HUD reader split.
 * Game-owned objects are never retained; consumers receive copied strings and a local revision.
 * A revision is cache identity, NOT a world identifier or proof of freshness. */
class FcmHudRosterReader {
    public var phase(default, null):String = "reader entry";
    var sources:Array<{key:String, signature:String, revision:Int, at:Float}> = [];
    var nextRevision:Int = 0;
    public function new() {}
    public function clear():Void { sources = []; } // Never reuse revision numbers after detach.
    public static function field(value:Dynamic, key:String):Dynamic return FcmRoster.field(value, key);
    public static function providerReason(provider:Dynamic):String {
        if (provider == null) return "missing provider";
        if (field(provider, "isTest") == true) return "test provider";
        return field(provider, "dataReady") == true ? "" : "not ready";
    }
    public static function cleanName(name:String):String {
        // Match the proven widget sanitizer. Never embed a NUL in the SWF string pool.
        name = name.split("~").join(" ").split("\r").join(" ").split("\n").join(" ");
        name = name.split("\\u0000").join("").split("u0000").join("");
        var clean = "";
        for (i in 0...name.length) if (name.charCodeAt(i) >= 32 && name.charCodeAt(i) != 127) clean += name.charAt(i);
        name = clean;
        var title = name.indexOf("<");
        if (title >= 0) name = name.substr(0, title);
        name = StringTools.trim(StringTools.replace(name, "|", ""));
        return name.length > 64 ? name.substr(0, 64) : name;
    }
    static function count(rows:Dynamic, limit:Int):Int {
        var length:Dynamic = field(rows, "length");
        // Do not coerce native objects/strings into lengths or accept NaN/fractions.
        if (!Std.isOfType(length, Int) && !Std.isOfType(length, Float)) return -1;
        var n:Float = length;
        return Math.isFinite(n) && n >= 0 && n <= limit && n == Math.floor(n) ? Std.int(n) : -1;
    }
    public static function menu(provider:Dynamic):FcmMenuObservation {
        var result = new FcmMenuObservation();
        result.reason = providerReason(provider);
        if (result.reason != "") return result;
        var rows = field(field(provider, "data"), "menuStackA");
        var n = count(rows, 128);
        if (n < 0) { result.reason = "missing list"; return result; }
        result.allowed = true;
        for (i in 0...n) try {
            var name = field(rows[i], "menuName");
            if (name == "MainMenu") result.allowed = false;
            if (name == "LoadingMenu") result.loading = true;
        } catch (_:Dynamic) { result.allowed = false; result.reason = "read failed"; return result; }
        result.reason = !result.allowed ? "main menu" : result.loading ? "loading" : "world allowed";
        return result;
    }
    public function provider(key:String, value:Dynamic, localName:String, at:Float, pushed:Bool = false):FcmRosterObservation {
        phase = "flags";
        var reason = providerReason(value);
        if (reason != "") return new FcmRosterObservation(key, at, reason);
        phase = "payload";
        return payload(key, field(value, "data"), localName, at, pushed);
    }
    /** Payload-only entry for tests; the live bridge must retain provider provenance.
     * Keep map/team traversal in the native-accepted helper, separate from auxiliary rows.
     * Do not restore the unified decoder: it fails GFx method entry even on synthetic data. */
    public function payload(key:String, data:Dynamic, localName:String, at:Float, pushed:Bool = false):FcmRosterObservation {
        var result = new FcmRosterObservation(key, at);
        phase = "list shape";
        var rows:Dynamic = null;
        var names:Array<String> = null;
        var selfName:String = "";
        if (key == "MapMenuData" || key == "PublicTeamsData") {
            rows = field(data, key == "MapMenuData" ? "MarkerData" : "publicTeams");
            if (count(rows, 2048) < 0) { result.reason = "invalid list"; return result; }
            phase = "map team helper";
            names = FcmRoster.readNames(key, data, localName);
            if (names != null) selfName = FcmRoster.lastSelfName;
        } else {
            if (key == "TeamMarkers") { try { rows = data.Markers; } catch (_:Dynamic) {} }
            else if (key == "VoiceChatAreaData") { try { rows = data.participants; } catch (_:Dynamic) {} }
            else if (key == "PlayerListData" || key == "PartyMenuList") rows = data;
            else { result.reason = "unknown source"; return result; }
            var n = count(rows, 2048);
            if (n < 0) { result.reason = "invalid list"; return result; }
            phase = "auxiliary helper";
            var auxiliary = readAuxiliary(rows, n, localName);
            if (auxiliary != null) { names = auxiliary.names; selfName = auxiliary.selfName; }
        }
        // Invalid/damaged data is not evidence of an empty or partial world.
        if (names == null) { result.reason = "unreadable entries"; result.skipped = 1; return result; }
        phase = "copy";
        var local = cleanName(localName).toLowerCase();
        for (name in names) {
            var clean = cleanName(name);
            if (clean.length > 0 && clean.toLowerCase() != local && result.names.indexOf(clean) < 0
                    && result.names.length < 24) result.names.push(clean);
        }
        result.names.sort(compare);
        result.selfName = cleanName(selfName);
        return remember(result, pushed);
    }

    /** Mirrors the accepted widget's four-source traversal, without map/team branches. */
    function readAuxiliary(rows:Dynamic, n:Int, localName:String):{names:Array<String>, selfName:String} {
        phase = "auxiliary rows";
        var names:Array<String> = [];
        var local = cleanName(localName).toLowerCase();
        var damaged = false;
        var selfName = "";
        for (i in 0...n) {
            try {
                var row:Dynamic = rows[i];
                if (row == null) continue;
                if (field(row, "isLocalPlayer") == true || field(row, "isLocal") == true || field(row, "isSelf") == true) {
                    for (candidate in ["displayName", "characterName", "name", "playerName"]) {
                        var ownValue:Dynamic = field(row, candidate);
                        if (ownValue != null && Std.string(ownValue).length > 0) { selfName = cleanName(Std.string(ownValue)); break; }
                    }
                    continue;
                }
                var name:String = "";
                for (candidate in ["displayName", "characterName", "name", "playerName"]) {
                    var value:Dynamic = field(row, candidate);
                    if (value != null && Std.string(value).length > 0) { name = Std.string(value); break; }
                }
                name = cleanName(name);
                if (name.length > 0 && name.toLowerCase() != local && names.indexOf(name) < 0
                        && names.length < 24) names.push(name);
            } catch (_:Dynamic) {
                damaged = true;
            }
        }
        return damaged ? null : {names:names, selfName:selfName};
    }

    function remember(result:FcmRosterObservation, pushed:Bool):FcmRosterObservation {
        var signature = result.selfName + "\x1F" + result.names.join("|");
        var previous = null;
        for (source in sources) if (source.key == result.key) previous = source;
        if (previous == null) {
            previous = {key:result.key, signature:signature, revision:++nextRevision, at:result.at}; sources.push(previous);
        } else if (pushed || previous.signature != signature) {
            previous.signature = signature; previous.revision = ++nextRevision;
            previous.at = result.at;
        }
        result.revision = previous.revision;
        result.at = previous.at; // Rereading an unchanged cache must not renew freshness.
        return result;
    }
    static function compare(a:String, b:String):Int return a < b ? -1 : a > b ? 1 : 0;
}

/** No provider, payload, event, or native object references may cross this boundary. */
class FcmRosterObservation {
    public var key:String;
    public var at:Float;
    public var reason:String;
    public var names:Array<String> = [];
    public var selfName:String = "";
    public var revision:Int = 0;
    public var skipped:Int = 0;
    public function new(key:String, at:Float, reason:String = "") {
        this.key = key; this.at = at; this.reason = reason;
    }
}

class FcmMenuObservation {
    public var allowed:Bool = false;
    public var loading:Bool = false;
    public var reason:String = "not observed";
    public function new() {}
}
