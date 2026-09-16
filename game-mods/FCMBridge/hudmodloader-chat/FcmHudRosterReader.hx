/** The only roster decoder shared by the visible HUD and invisible bridge.
 * Game-owned objects stay here; consumers receive copied strings and a local revision.
 * A revision is cache identity, NOT a world identifier or proof of freshness. */
class FcmHudRosterReader {
    public var phase(default, null):String = "reader entry";
    var sources:Array<{key:String, data:Dynamic, signature:String, revision:Int, at:Float}> = [];
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
    /** Payload-only entry is for the visible widget's existing callback contract.
     * The background bridge must use provider(), retaining envelope provenance. */
    public function payload(key:String, data:Dynamic, localName:String, at:Float, pushed:Bool = false):FcmRosterObservation {
        var result = new FcmRosterObservation(key, at);
        phase = "list shape";
        var rows:Dynamic = switch key {
            case "MapMenuData": field(data, "MarkerData");
            case "PublicTeamsData": field(data, "publicTeams");
            case "TeamMarkers": field(data, "Markers");
            case "VoiceChatAreaData": field(data, "participants");
            case "PlayerListData", "PartyMenuList": data;
            default: result.reason = "unknown source"; return result;
        };
        var n = count(rows, 2048);
        if (n < 0) { result.reason = "invalid list"; return result; }
        phase = "names";
        var local = cleanName(localName).toLowerCase();
        for (i in 0...n) try {
            var row:Dynamic = rows[i];
            if (row == null) continue;
            if (key == "MapMenuData") {
                if (field(row, "markerType") == "PlayerRemote") add(result, field(row, "text"), local);
            } else if (key == "PublicTeamsData") {
                var members = field(row, "members");
                var memberCount = count(members, 24);
                if (memberCount < 0) { result.skipped++; continue; }
                for (j in 0...memberCount) try { add(result, field(members[j], "playerName"), local); }
                    catch (_:Dynamic) { result.skipped++; }
            } else {
                if (field(row, "isLocalPlayer") == true || field(row, "isLocal") == true || field(row, "isSelf") == true) continue;
                for (candidate in ["displayName", "characterName", "name", "playerName"]) {
                    var value = field(row, candidate);
                    if (value == null) continue;
                    var name = cleanName(Std.string(value));
                    if (name.length == 0) continue;
                    add(result, name, local); break;
                }
            }
        } catch (_:Dynamic) { result.skipped++; }
        // A damaged list is not evidence of an empty/partial world. Keep diagnostics,
        // but do not let the bridge renew a lease or choose a boundary from it.
        if (result.skipped > 0) { result.reason = "unreadable entries"; return result; }
        phase = "copy";
        result.names.sort(compare);
        var signature = result.names.join("|");
        var previous = null;
        for (source in sources) if (source.key == key) previous = source;
        if (previous == null) {
            previous = {key:key, data:data, signature:signature, revision:++nextRevision, at:at}; sources.push(previous);
        } else if (pushed || previous.data != data || previous.signature != signature) {
            previous.data = data; previous.signature = signature; previous.revision = ++nextRevision;
            previous.at = at;
        }
        result.revision = previous.revision;
        result.at = previous.at; // Rereading an unchanged cache must not renew freshness.
        return result;
    }
    static function compare(a:String, b:String):Int return a < b ? -1 : a > b ? 1 : 0;
    static function add(result:FcmRosterObservation, value:Dynamic, local:String):Void {
        if (value == null) return;
        var name = cleanName(Std.string(value));
        if (name.length > 0 && name.toLowerCase() != local && result.names.indexOf(name) < 0 && result.names.length < 24)
            result.names.push(name);
    }
}

/** No provider, payload, event, or native object references may cross this boundary. */
class FcmRosterObservation {
    public var key:String;
    public var at:Float;
    public var reason:String;
    public var names:Array<String> = [];
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
