/** Bounded provider snapshots using GFx-native arrays, with no Map key iterator classes. */
class FcmRoster {
    /** Fixed diagnostic labels only; never provider data, names or identifiers. */
    public static var readPhase:String = "not started";
    /** Shape-only UI interoperability; no game IDs or non-player map markers are sent. */
    public static function field(value:Dynamic, key:String):Dynamic {
        if (value == null) return null;
        try { var result = Reflect.field(value, key); if (result != null) return result; } catch (e:Dynamic) {}
        try { return untyped value[key]; } catch (e:Dynamic) { return null; }
    }

    /** Read only the menu names already exposed to the HUD. */
    public static function hasPipboy(data:Dynamic):Bool {
        var menus:Dynamic = field(data, "menuStackA");
        var length:Dynamic = field(menus, "length");
        if (length == null) return false;
        for (i in 0...Std.int(Math.min(128, Std.int(length)))) {
            var name = field(menus[i], "menuName");
            if (name != null && Std.string(name).toLowerCase().indexOf("pipboy") >= 0) return true;
        }
        return false;
    }

    public static function isMainMenu(data:Dynamic):Bool {
        var menus:Dynamic = field(data, "menuStackA");
        var length:Dynamic = field(menus, "length");
        if (length == null) return false;
        for (i in 0...Std.int(length)) {
            try { if (field(menus[i], "menuName") == "MainMenu") return true; } catch (e:Dynamic) {}
        }
        return false;
    }

    /**
     * Decode a visible-widget roster directly in the child SWF. This deliberately
     * does not instantiate the background bridge's shared decoder/observation
     * classes. Native 2.10.104 still failed; readPhase distinguishes method-entry
     * verification from a helper or game-data failure. The result contains copied strings
     * only; it never retains a provider, payload, event, or native row object.
     */
    public static function readNative(key:String, data:Dynamic, localName:String):{valid:Bool, names:Array<String>, skipped:Int} {
        readPhase = "decoder entered";
        var result:{valid:Bool, names:Array<String>, skipped:Int} = {valid:false, names:[], skipped:0};
        readPhase = "list shape";
        var rows:Dynamic = switch key {
            case "MapMenuData": field(data, "MarkerData");
            case "PublicTeamsData": field(data, "publicTeams");
            case "TeamMarkers": field(data, "Markers");
            case "VoiceChatAreaData": field(data, "participants");
            case "PlayerListData", "PartyMenuList": data;
            default: return result;
        };
        var count = nativeCount(rows, 2048);
        if (count < 0) return result;

        readPhase = "local name cleanup";
        var local = cleanName(localName).toLowerCase();
        readPhase = "row traversal";
        for (i in 0...count) try {
            var row:Dynamic = rows[i];
            if (row == null) continue;
            if (key == "MapMenuData") {
                if (field(row, "markerType") == "PlayerRemote") addName(result.names, field(row, "text"), local);
            } else if (key == "PublicTeamsData") {
                var members:Dynamic = field(row, "members");
                var memberCount = nativeCount(members, 24);
                if (memberCount < 0) { result.skipped++; continue; }
                for (j in 0...memberCount) try {
                    addName(result.names, field(members[j], "playerName"), local);
                } catch (_:Dynamic) {
                    result.skipped++;
                }
            } else {
                if (field(row, "isLocalPlayer") == true || field(row, "isLocal") == true || field(row, "isSelf") == true)
                    continue;
                for (candidate in ["displayName", "characterName", "name", "playerName"]) {
                    var value = field(row, candidate);
                    if (value == null) continue;
                    var name = cleanName(value);
                    if (name.length == 0) continue;
                    addName(result.names, name, local);
                    break;
                }
            }
        } catch (_:Dynamic) {
            result.skipped++;
        }

        // A damaged native list is not proof of a partial or empty world. Fail
        // closed instead of allowing it to renew/replace a Server-room roster.
        if (result.skipped > 0) {
            result.names = [];
            return result;
        }
        readPhase = "sort names";
        result.names.sort(compare);
        result.valid = true;
        readPhase = "decoder complete";
        return result;
    }

    /** Pre-2.10.103 map/team reader. Do not route this back through readNative: the
     * latter fails method entry even on synthetic data in native 2.10.105. Return
     * null for invalid/damaged data so callers cannot store an empty/partial world. */
    public static function readNames(key:String, data:Dynamic, localName:String):Array<String> {
        if (key != "MapMenuData" && key != "PublicTeamsData") return null;
        var result:Array<String> = [];
        var add = function(value:Dynamic):Void {
            if (value == null) return;
            var name = Std.string(value);
            var title = name.indexOf("<");
            if (title >= 0) name = name.substr(0, title);
            name = StringTools.trim(StringTools.replace(name, "|", ""));
            if (name.length > 0 && name.toLowerCase() != localName.toLowerCase()
                    && result.indexOf(name) < 0 && result.length < 24) result.push(name);
        };
        var rows:Dynamic = key == "MapMenuData" ? field(data, "MarkerData") : field(data, "publicTeams");
        var length:Dynamic = field(rows, "length");
        if (!Std.isOfType(length, Int) && !Std.isOfType(length, Float)) return null;
        var n:Int = Std.int(length);
        if (n != length || n < 0 || n > 2048) return null;
        for (i in 0...n) try {
            var row:Dynamic = rows[i];
            if (key == "MapMenuData") {
                if (field(row, "markerType") == "PlayerRemote") add(field(row, "text"));
            } else {
                var members:Dynamic = field(row, "members");
                var count:Dynamic = field(members, "length");
                if (!Std.isOfType(count, Int) && !Std.isOfType(count, Float)) return null;
                var memberCount:Int = Std.int(count);
                if (memberCount != count || memberCount < 0 || memberCount > 24) return null;
                for (j in 0...memberCount) add(field(members[j], "playerName"));
            }
        } catch (e:Dynamic) { return null; }
        result.sort(function(a,b) return a < b ? -1 : a > b ? 1 : 0);
        return result;
    }

    /** Bound a native array-like value without accepting strings, fractions or NaN. */
    static function nativeCount(rows:Dynamic, limit:Int):Int {
        readPhase = "length property";
        var length:Dynamic = field(rows, "length");
        readPhase = "length type";
        if (!Std.isOfType(length, Int) && !Std.isOfType(length, Float)) return -1;
        readPhase = "length bounds";
        var number:Float = length;
        return Math.isFinite(number) && number >= 0 && number <= limit && number == Math.floor(number)
            ? Std.int(number) : -1;
    }

    /** Same wire-safe cleanup used for the visible roster path. */
    public static function cleanName(value:Dynamic):String {
        if (value == null) return "";
        var name:String = "";
        try { name = Std.string(value); } catch (_:Dynamic) { return ""; }
        name = name.split("~").join(" ").split("\r").join(" ").split("\n").join(" ");
        name = name.split("\\u0000").join("").split("u0000").join("");
        var clean = "";
        for (i in 0...name.length) if (name.charCodeAt(i) >= 32 && name.charCodeAt(i) != 127) clean += name.charAt(i);
        var title = clean.indexOf("<");
        if (title >= 0) clean = clean.substr(0, title);
        clean = StringTools.trim(StringTools.replace(clean, "|", ""));
        return clean.length > 64 ? clean.substr(0, 64) : clean;
    }

    static function addName(names:Array<String>, value:Dynamic, local:String):Void {
        var name = cleanName(value);
        if (name.length > 0 && name.toLowerCase() != local && names.indexOf(name) < 0 && names.length < 24)
            names.push(name);
    }

    static function compare(a:String, b:String):Int return a < b ? -1 : a > b ? 1 : 0;

    var entries:Array<{key:String, names:Array<String>, at:Float}> = [];
    var emptySince:Float = -1;
    public function new() {}

    public function replace(key:String, names:Array<String>, now:Float):Array<String> {
        for (entry in entries) if (entry.key == key) {
            var previous = entry.names;
            entry.names = names.copy();
            entry.at = now;
            return previous;
        }
        entries.push({key:key, names:names.copy(), at:now});
        return null;
    }

    public function fresh(now:Float, ttl:Float):Array<String> {
        var kept:Array<{key:String, names:Array<String>, at:Float}> = [];
        var names:Array<String> = [];
        for (entry in entries) if (now - entry.at <= ttl) {
            kept.push(entry);
            for (name in entry.names) if (names.indexOf(name) < 0) names.push(name);
        }
        entries = kept;
        names.sort(function(a, b) return a < b ? -1 : (a > b ? 1 : 0));
        return names.slice(0, 24);
    }

    /** Choose among world-roster surfaces after pruning. An empty map can persist after
     * fast travel while public teams remain populated. A lower-priority nonempty list may
     * bridge that gap only with overlap in an established session, never stale disjoint names.
     * Nearby markers/voice are not evidence for overriding an empty primary. */
    function primarySource(previous:String):String {
        var emptyPrimary = "";
        for (key in ["MapMenuData", "PlayerListData", "PublicTeamsData"]) for (entry in entries) if (entry.key == key) {
            if (entry.names.length > 0 && (emptyPrimary.length == 0
                    || !FcmCommand.shouldRebindRosterSession(previous, entry.names.join("|")))) return key;
            if (emptyPrimary.length == 0) emptyPrimary = key;
        }
        return emptyPrimary;
    }

    /** The selected provider is shared with bridge boundary retention and diagnostics. */
    public function sessionSource(now:Float, ttl:Float, previous:String = ""):String {
        fresh(now, ttl);
        return primarySource(previous);
    }

    public function sessionNames(now:Float, ttl:Float, previous:String = ""):Array<String> {
        var fallback = fresh(now, ttl);
        var source = primarySource(previous);
        for (entry in entries) if (entry.key == source) {
            var names = entry.names.copy();
            names.sort(function(a, b) return a < b ? -1 : (a > b ? 1 : 0));
            return names.slice(0, 24);
        }
        return fallback;
    }

    /** An empty loading snapshot is not immediately a world boundary. Never extend the
     * grace on repeated empty polls, delay a nonempty roster, or delay initial solo binding.
     * The widget's independent relay-confirmation lease remains authoritative. */
    public function waitForRoster(previous:String, current:Array<String>, now:Float, grace:Float):Bool {
        if (previous.length == 0 || current.length > 0) {
            emptySince = -1;
            return false;
        }
        if (emptySince == -1) emptySince = now;
        return now - emptySince < grace;
    }
}
