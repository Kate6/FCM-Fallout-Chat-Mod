/** Pure URL extraction/presentation helpers for the constrained GFx HUD. */
class FcmLink {
    static var URL_RE:EReg = ~/https?:\/\/[^\s<>"']+/ig;

    public static function firstUrl(text:String):String {
        if (text == null || !URL_RE.match(text)) return "";
        return trimTrailing(URL_RE.matched(0));
    }

    public static function validHttpUrl(value:String):Bool {
        if (value == null || value.length == 0 || haxe.io.Bytes.ofString(value).length > 4096) return false;
        return ~/^https?:\/\/[^\s<>"']+$/i.match(value);
    }

    public static function displayUrl(value:String):String {
        if (!validHttpUrl(value)) return "";
        var schemeEnd:Int = value.indexOf("://") + 3;
        var rest:String = value.substr(schemeEnd);
        var slash:Int = rest.indexOf("/");
        var host:String = slash < 0 ? rest : rest.substr(0, slash);
        if (StringTools.startsWith(host.toLowerCase(), "www.")) host = host.substr(4);
        var display:String = slash >= 0 && slash < rest.length - 1 ? host + "/..." : host;
        return display.length > 34 ? display.substr(0, 31) + "..." : display;
    }

    public static function abbreviateBody(text:String):String {
        if (text == null || text.length == 0) return "";
        return URL_RE.map(text, function(re:EReg):String {
            var raw:String = re.matched(0);
            var url:String = trimTrailing(raw);
            var trailing:String = raw.substr(url.length);
            var display:String = displayUrl(url);
            return (display.length > 0 ? display : url) + trailing;
        });
    }

    static function trimTrailing(value:String):String {
        var end:Int = value.length;
        while (end > 0 && ".,;:!?)]}'\"".indexOf(value.charAt(end - 1)) >= 0) end--;
        return value.substr(0, end);
    }
}
