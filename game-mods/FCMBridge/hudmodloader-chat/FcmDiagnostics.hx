/** Count suspicious rows without exporting identifiers, names, or message content.
 * Maps live only for this snapshot and are bounded by the widget's record cap.
 */
class FcmDiagnostics {
    static var ROOM_EVENTS:Array<String> = ["roster_send", "roster_hold", "roster_boundary", "roster_stale", "main_menu"];
    static var ROOM_PROVIDERS:Array<String> = ["zfe", "xscal"];
    static var ROOM_SOURCES:Array<String> = ["none", "PlayerListData", "MapMenuData", "PublicTeamsData"];

    /** Fixed-enum, value-free room evidence sent through authenticated chat.v1 controls. */
    public static function roomControl(event:String, provider:String, source:String, count:Int, build:String):String {
        if (ROOM_EVENTS.indexOf(event) < 0 || ROOM_PROVIDERS.indexOf(provider) < 0
                || ROOM_SOURCES.indexOf(source) < 0 || count < 0 || count > 24
                || !validBuild(build)) return "";
        return "FCMCTL/1/DIAG:event=" + event + ";provider=" + provider + ";source=" + source
            + ";count=" + count + ";build=" + build;
    }

    static function validBuild(value:String):Bool {
        if (value == null || value.length < 5 || value.length > 11) return false;
        var parts = value.split(".");
        if (parts.length != 3) return false;
        for (part in parts) {
            if (part.length < 1 || part.length > 3) return false;
            for (i in 0...part.length) {
                var code = part.charCodeAt(i);
                if (code < 48 || code > 57) return false;
            }
        }
        return true;
    }

    public static function rows(records:Array<{messageId:String, senderUserId:String,
            channel:String, body:String, pending:Bool}>):String {
        var ids:Map<String, Bool> = new Map();
        var content:Map<String, Bool> = new Map();
        var repeatedIds = 0;
        var repeatedContent = 0;
        var pending = 0;
        for (rec in records) {
            if (rec.pending) pending++;
            if (rec.messageId != null && rec.messageId.length > 0) {
                if (ids.exists(rec.messageId)) repeatedIds++;
                ids.set(rec.messageId, true);
            }
            // Length prefixes prevent ambiguous concatenations; never log the key.
            var key = part(rec.channel) + part(rec.senderUserId) + part(rec.body);
            if (content.exists(key)) repeatedContent++;
            content.set(key, true);
        }
        return "repeatedIds=" + repeatedIds + " repeatedContent=" + repeatedContent
            + " pendingRows=" + pending;
    }

    static function part(value:String):String {
        return value == null ? "-1:" : value.length + ":" + value;
    }
}
