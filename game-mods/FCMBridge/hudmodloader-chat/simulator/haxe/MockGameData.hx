class MockGameData {
    static var hudMode:String = "All";
    static var subscribers:Map<String, Array<Dynamic>> = new Map();
    static var overrides:Map<String, Dynamic> = new Map();

    /** Publish through the same cache + CHANGE callback path used by the widget in game. */
    public static function publish(key:String, data:Dynamic):Void {
        overrides.set(key, data);
        var callbacks = subscribers.get(key);
        if (callbacks != null) for (callback in callbacks.copy())
            Reflect.callMethod(null, callback, [{data:data}]);
    }

    public static function setHudMode(value:String):Void {
        hudMode = value;
        var callbacks = subscribers.get("HUDModeData");
        if (callbacks != null) for (callback in callbacks) Reflect.callMethod(null, callback, [{data:{hudMode:hudMode}}]);
    }

    public static function manager():Dynamic {
        var out:Dynamic = {};
        Reflect.setField(out, "GetDataFromClient", function(key:String):Dynamic {
            if (overrides.exists(key)) return overrides.get(key);
            return switch (key) {
                case "AccountInfoData": {accountName:"Simulator76", displayName:"Simulator76", isLoggedIn:true};
                case "MapMenuData": {MarkerData:[
                    {markerType:"PlayerLocal", text:"Simulator76", playerLevel:100},
                    {markerType:"PlayerRemote", text:"HarnessPeer", playerLevel:50}
                ]};
                case "MenuStackData": {menuStackA:[]};
                case "HUDMode", "HUDModeData": {data:{hudMode:hudMode}};
                default: {};
            };
        });
        Reflect.setField(out, "Subscribe", function(key:String, callback:Dynamic):Bool {
            if (!subscribers.exists(key)) subscribers.set(key, []);
            subscribers.get(key).push(callback);
            return true;
        });
        Reflect.setField(out, "Unsubscribe", function(key:String, callback:Dynamic):Bool {
            var callbacks = subscribers.get(key);
            return callbacks != null && callbacks.remove(callback);
        });
        return out;
    }
}
