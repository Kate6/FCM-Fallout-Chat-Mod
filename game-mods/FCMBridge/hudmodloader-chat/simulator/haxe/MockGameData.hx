class MockGameData {
    static var hudMode:String = "All";
    static var subscribers:Map<String, Array<Dynamic>> = new Map();

    public static function setHudMode(value:String):Void {
        hudMode = value;
        var callbacks = subscribers.get("HUDModeData");
        if (callbacks != null) for (callback in callbacks) Reflect.callMethod(null, callback, [{data:{hudMode:hudMode}}]);
    }

    public static function manager():Dynamic {
        var out:Dynamic = {};
        Reflect.setField(out, "GetDataFromClient", function(key:String):Dynamic {
            return switch (key) {
                case "AccountInfoData": {accountName:"Simulator76", displayName:"Simulator76", isLoggedIn:true};
                case "MenuStack": {menuStack:[]};
                case "HUDMode", "HUDModeData": {data:{hudMode:hudMode}};
                default: {};
            };
        });
        Reflect.setField(out, "Subscribe", function(key:String, callback:Dynamic):Bool {
            if (!subscribers.exists(key)) subscribers.set(key, []);
            subscribers.get(key).push(callback);
            return true;
        });
        Reflect.setField(out, "Unsubscribe", function(_:String, __:Dynamic):Bool return true);
        return out;
    }
}
