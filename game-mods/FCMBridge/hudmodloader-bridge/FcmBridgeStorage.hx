/** Provider-scoped storage only. Deliberately independent of chat/auth/input APIs. */
class FcmBridgeStorage {
    // Cached fixed labels only; no raw native replies, exceptions or player data.
    public static var diagnostic(default, null):String = "not attempted";
    static var probePhase:String = "entry";
    public var provider(default, null):String;
    public var route(default, null):String;
    var root:Dynamic;
    var environment:String;
    function new(provider:String, root:Dynamic, environment:String) {
        this.provider = provider; this.root = root; this.environment = environment;
        route = provider == "xscal" ? "modStorage" : "call";
    }
    static function field(value:Dynamic, key:String):Dynamic return FcmRoster.field(value, key);
    static function callable(value:Dynamic, key:String):Bool return Reflect.isFunction(field(value, key));

    public static function xscal(root:Dynamic, environment:String):FcmBridgeStorage {
        if (field(field(root, "version"), "runtime") != "xScal") return null;
        var storage = field(root, "modStorage");
        if (!callable(storage, "register") || !callable(storage, "save")) return null;
        try {
            if (storage.register("fcmserverbridge-" + environment) == true)
                return new FcmBridgeStorage("xscal", storage, environment);
        } catch (_:Dynamic) {}
        return null;
    }
    public static function zfe(root:Dynamic, environment:String):FcmBridgeStorage {
        if (!callable(root, "call")) return null;
        try {
            probePhase = "call";
            var response:Dynamic = root.call("getRuntimeInfo", "{}");
            probePhase = "parse";
            // Match the visible HUD's bounded GFx reader. The generic parser
            // raised native E1014 at this boundary in the 0.2.2 laptop build.
            var info:Dynamic = FcmJson.parse(Std.string(response));
            if (info == null) { probePhase = "parse error"; return null; }
            probePhase = "rejected";
            if (field(info, "success") != true) return null;
            var capabilities:Dynamic = field(info, "capabilities");
            probePhase = "capabilities invalid";
            if (!Std.isOfType(capabilities, Array)) return null;
            probePhase = "storage absent";
            var supported = false;
            for (capability in (cast capabilities:Array<Dynamic>)) if (capability == "zfe-storage-v1") supported = true;
            if (supported) { probePhase = "ready"; return new FcmBridgeStorage("zfe", root, environment); }
        } catch (error:Dynamic) { probePhase += " " + FcmBridgeRead.errorCode(error); }
        return null;
    }
    static function probe(root:Dynamic, key:String, environment:String):FcmBridgeStorage {
        if (!callable(root, "call")) return null;
        probePhase = "entry";
        diagnostic = key + " entry";
        var api:FcmBridgeStorage = null;
        // Catch method-entry verification errors outside zfe's own body as well.
        try { api = zfe(root, environment); }
        catch (error:Dynamic) { probePhase += " " + FcmBridgeRead.errorCode(error); }
        diagnostic = key + " " + probePhase;
        if (api != null) api.route = key;
        return api;
    }
    public static function discover(scope:Dynamic, environment:String):FcmBridgeStorage {
        diagnostic = "scope discovery";
        var scopes:Array<Dynamic> = [];
        var current = scope;
        for (_ in 0...16) {
            if (current == null) break;
            scopes.push(current); current = field(current, "parent");
        }
        // A loaded movie's root is not necessarily on its current parent chain.
        var movieRoot = field(scope, "root");
        if (movieRoot != null && scopes.indexOf(movieRoot) < 0) scopes.push(movieRoot);
        #if flash
        var stage:Dynamic = field(scope, "stage");
        if (stage != null) {
            scopes.push(stage);
            // Documented xScal request surface. Never replace an existing provider.
            if (field(stage, "__SFCodeObj") == null) try { stage.__SFCodeObj = {}; } catch (_:Dynamic) {}
            for (i in 0...Std.int(Math.min(32, stage.numChildren))) scopes.push(stage.getChildAt(i));
        }
        // AVM2 getlex throws when an optional global is absent (unlike an absent
        // dynamic property). Missing globals must not skip discovered parent roots.
        try { scopes.push({__SFCodeObj:untyped __global__["__SFCodeObj"]}); } catch (_:Dynamic) {}
        try { scopes.push({__ZFE:untyped __global__["__ZFE"]}); } catch (_:Dynamic) {}
        try { scopes.push({ZFECodeObj:untyped __global__["ZFECodeObj"]}); } catch (_:Dynamic) {}
        try { scopes.push({BRG_OBJ:untyped __global__["BRG_OBJ"]}); } catch (_:Dynamic) {}
        #end
        // Preserve explicit xScal-first policy, never object enumeration order.
        diagnostic = "xScal discovery";
        for (item in scopes) {
            var api = xscal(field(item, "__SFCodeObj"), environment);
            if (api != null) { diagnostic = "xScal ready"; return api; }
        }
        diagnostic = "no callable API";
        for (item in scopes) for (key in ["__ZFE", "ZFECodeObj", "__SFCodeObj"]) {
            var api = probe(field(item, key), key, environment);
            if (api != null) { api.route = key; return api; }
        }
        // The native HUD already supports this legacy ZFE dispatcher when modern
        // aliases cannot attach. Its name alone proves nothing: require the same
        // successful storage capability probe, never a chat/auth probe or bypass.
        for (item in scopes) {
            var api = probe(field(item, "BRG_OBJ"), "BRG_OBJ", environment);
            if (api != null) { api.route = "BRG_OBJ"; return api; }
        }
        return null;
    }
    public function save(document:String):Bool {
        if (haxe.io.Bytes.ofString(document).length > 8192) return false;
        try {
            if (provider == "xscal") return root.save(document) == true;
            var result:Dynamic = FcmJson.parse(Std.string(root.call("writeStorage", haxe.Json.stringify({
                vendor:"FCMServerBridge", path:environment + "-state.json", text:document
            }))));
            return field(result, "success") == true && field(result, "status") == "saved";
        } catch (_:Dynamic) { return false; }
    }
}
