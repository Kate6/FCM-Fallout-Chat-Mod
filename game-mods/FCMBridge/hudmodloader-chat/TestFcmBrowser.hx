class TestFcmBrowser {
    static function check(ok:Bool, label:String):Void { if (!ok) throw label; }
    public static function main():Void {
        var calls:Array<String> = [];
        var capable = true;
        var reply:Dynamic = {success:true,requestId:"r",state:"accepted",terminal:false};
        var url = "https://example.org/wiki?a=1&b=2#Build";
        var browser = new FcmBrowser(function(verb, payload) {
            calls.push(verb);
            var p = FcmJson.parse(payload);
            return haxe.Json.stringify(switch (verb) {
                case "getRuntimeInfo": {success:true, capabilities:capable ? ["zfe-browser-v1"] : []};
                case "browser.v1.beginAction":
                    check(p.url == url, "exact action URL");
                    {success:true,actionId:"a",expiresInMs:15000};
                case "browser.v1.request":
                    check(p.url == url && p.actionId == "a", "exact request binding"); reply;
                default: reply;
            });
        });
        capable = false;
        browser.activate(url, 0);
        check(calls.length == 1 && !browser.pending(), "absent capability");
        capable = true; calls = [];
        browser.activate(url, 100);
        check(browser.pending() && calls.length == 3, "synchronous admission");
        browser.activate(url, 110);
        browser.tick(349);
        check(calls.length == 3, "no overlap or early poll");
        browser.tick(350);
        check(calls.length == 4, "250ms poll");
        reply = {success:true,requestId:"r",state:"launch_unknown",terminal:true};
        browser.tick(600); browser.tick(900);
        check(!browser.pending() && calls.length == 5 && browser.state == "launch_unknown", "unknown terminal no retry");
        for (state in ["handed_off", "denied", "cancelled", "expired", "failed"]) {
            reply = {success:true,requestId:"r",state:state,terminal:true};
            browser.activate(url, 1000);
            check(!browser.pending() && browser.state == state, "immediate terminal " + state);
        }
        reply = {success:true,requestId:"r",state:"pending_confirmation",terminal:false};
        browser.activate(url, 2000); browser.cancel();
        check(!browser.pending() && calls[calls.length-1] == "browser.v1.cancel", "cancel owner");
        browser.activate(url, 3000);
        reply = {success:true,requestId:"other",state:"accepted",terminal:false};
        browser.tick(3250);
        check(!browser.pending() && browser.state == "unavailable", "mismatched snapshot stops");
        reply = {success:false,error:{code:"rate_limited"}};
        browser.activate(url, 4000); var count = calls.length; browser.tick(5000);
        check(!browser.pending() && calls.length == count, "rejection no retry");
        reply = {success:true,requestId:"r",state:"mystery",terminal:false};
        browser.activate(url, 6000);
        check(!browser.pending() && calls[calls.length-1] == "browser.v1.cancel", "unknown state cancels");
        for (bad in ['null', '{}', '{"success":"true","capabilities":["zfe-browser-v1"]}',
                '{"success":1,"capabilities":["zfe-browser-v1"]}',
                '{"success":true,"capabilities":"zfe-browser-v1"}']) {
            var invalidCalls = 0;
            var invalid = new FcmBrowser(function(_, _) { invalidCalls++; return bad; });
            invalid.activate(url, 0); invalid.tick(1000);
            check(invalidCalls == 1 && !invalid.pending(), "malformed capability fails closed");
        }
        var throwing = new FcmBrowser(function(_, _) { throw "private native detail"; return ""; });
        check(throwing.activate(url, 0) == "unavailable", "native exception isolated");
        trace("TestFcmBrowser OK");
    }
}
