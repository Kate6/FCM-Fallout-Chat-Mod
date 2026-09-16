/** Bounded provider snapshots using GFx-native arrays, with no Map key iterator classes. */
class FcmRoster {
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

    /** Compatibility facade; all decoding belongs to the shared collector. */
    public static function readNames(key:String, data:Dynamic, localName:String):Array<String> {
        var result = new FcmHudRosterReader().payload(key, data, localName, 0);
        return result.reason == "" ? result.names : [];
    }

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
