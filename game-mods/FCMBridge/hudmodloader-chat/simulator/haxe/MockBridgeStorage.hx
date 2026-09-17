/** File-boundary fake only; it never claims a backend room or supplies credentials. */
class MockBridgeStorage {
    public static var document:Dynamic = null;
    public static var writes:Int = 0;
    public static var fail:Bool = false;
    public static function save(text:String):Bool {
        writes++;
        if (fail) return false;
        document = haxe.Json.parse(text); return true;
    }
    public static function root():Dynamic return {version:{runtime:"xScal",value:"sim",platform:"sim"},modStorage:{
        register:function(name:String):Bool return name == "fcmserverbridge-prod" || name == "fcmserverbridge-dev",
        save:save
    }};
}
