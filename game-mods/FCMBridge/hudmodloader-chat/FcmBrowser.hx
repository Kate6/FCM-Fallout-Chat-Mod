/** ZFE browser-v1 client. Only activate() admits local intent; tick never retries. */
class FcmBrowser {
    var call:String->String->Dynamic;
    public var requestId(default, null):String = "";
    public var state(default, null):String = "unavailable";
    var lastPoll:Float = 0;
    var started:Float = 0;
    public function new(call:String->String->Dynamic) { this.call = call; }
    function invoke(verb:String, payload:Dynamic):Dynamic {
        try { return FcmJson.parse(Std.string(call(verb, haxe.Json.stringify(payload)))); }
        catch (_:Dynamic) { return null; }
    }
    static function succeeded(value:Dynamic):Bool {
        return value != null && Std.isOfType(value.success, Bool) && value.success == true;
    }
    static function stringId(value:Dynamic):Bool {
        return Std.isOfType(value, String) && value.length > 0;
    }
    public function activate(url:String, now:Float):String {
        if (requestId.length > 0) return state; // no queue, no replacement
        state = "unavailable";
        var info = invoke("getRuntimeInfo", {});
        if (!succeeded(info) || !Std.isOfType(info.capabilities, Array)) return state;
        var caps:Array<Dynamic> = cast info.capabilities;
        if (caps.indexOf("zfe-browser-v1") < 0) return state;
        var action = invoke("browser.v1.beginAction", {url:url});
        if (!succeeded(action) || !stringId(action.actionId)) return state;
        started = lastPoll = now;
        accept(invoke("browser.v1.request", {actionId:action.actionId, url:url}));
        return state;
    }
    function accept(result:Dynamic):Void {
        if (!succeeded(result) || !stringId(result.requestId)
                || !Std.isOfType(result.state, String) || !Std.isOfType(result.terminal, Bool)
                || (requestId.length > 0 && result.requestId != requestId)) {
            cancel(); state = "unavailable"; return;
        }
        var terminal = ["handed_off", "denied", "cancelled", "expired", "failed", "launch_unknown"].indexOf(result.state) >= 0;
        var pending = ["accepted", "pending_confirmation", "launching"].indexOf(result.state) >= 0;
        requestId = result.requestId;
        if ((!terminal && !pending) || result.terminal != terminal) {
            cancel(); state = "unavailable"; return;
        }
        state = result.state;
        if (terminal) requestId = "";
    }
    public function tick(now:Float):Void {
        if (requestId.length == 0 || now - lastPoll < 250) return;
        // Bound polling even if a broken provider never terminates its snapshot.
        if (now - started > 45000) { cancel(); state = "launch_unknown"; return; }
        lastPoll = now;
        accept(invoke("browser.v1.poll", {requestId:requestId}));
    }
    public function cancel():Void {
        var id = requestId;
        requestId = "";
        if (id.length > 0) invoke("browser.v1.cancel", {requestId:id});
        state = "cancelled";
    }
    public function pending():Bool { return requestId.length > 0; }
}
