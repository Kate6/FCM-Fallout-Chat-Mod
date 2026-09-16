import flash.display.Sprite;
import flash.display.Loader;
import flash.events.Event;
import flash.events.IOErrorEvent;
import flash.external.ExternalInterface;
import flash.net.URLRequest;
import flash.system.ApplicationDomain;
import flash.system.LoaderContext;

/** Deliberately has NO production class path/imports, @:access, or shared mocks.
 * Loads the decoded release-package child in a fresh domain. All transport is local fake data. */
class PackagedBridgeHost extends Sprite {
    public var BSUIDataManager:Dynamic;
    public var __ZFE:Dynamic;
    public var __SFECodeObj:Dynamic;
    public var __SFCodeObj:Dynamic;
    var movie:Loader = new Loader();
    var providers:Array<{key:String, value:Dynamic}> = [];
    var listeners:Array<{key:String, callback:Dynamic}> = [];
    var events:Array<Dynamic> = [];
    var eventId:Int = 0;
    var controls:Int = 0;
    var leaves:Int = 0;
    var polls:Int = 0;
    var disconnects:Int = 0;
    var connected:Bool = false;
    var bound:Bool = false;
    var isolated:Bool = false;
    var violation:Bool = false;
    var request:String = "";
    var previousRequest:String = "";
    var rebound:Bool = false;
    var source:String = "xscal";
    var phase:String = "initial";
    var acceptedNames:Bool = false;
    var disposed:Bool = false;

    static function main():Void { flash.Lib.current.addChild(new PackagedBridgeHost()); }
    public function new() {
        super();
        source = flash.Lib.current.loaderInfo.parameters.provider == "zfe" ? "zfe" : "xscal";
        BSUIDataManager = {
            GetDataFromClient:function(key:String):Dynamic {
                for (entry in providers) if (entry.key == key) return entry.value;
                return null;
            },
            Subscribe:function(key:String, callback:Dynamic):Void { listeners.push({key:key, callback:callback}); },
            Unsubscribe:function(key:String, callback:Dynamic):Void {
                for (entry in listeners.copy()) if (entry.key == key && entry.callback == callback) listeners.remove(entry);
            }
        };
        publish("MenuStackData", {menuStackA:[]});
        publish("AccountInfoData", {name:"HarnessSelf"});
        roster(["PeerA", "PeerB"], flash.Lib.current.loaderInfo.parameters.scenario != "packaged-unready");
        if (source == "zfe") __ZFE = {call:dispatch};
        else {
            __SFCodeObj = {call:dispatch}; // Separate logger, never chat routing.
            __SFECodeObj = {chatInterface:{
                connect:function(args:Dynamic):Dynamic return connect(),
                disconnect:function():Dynamic return disconnect(),
                getConnectionState:function():Dynamic return {success:true,status:"authenticated"},
                pollEvents:function(args:Dynamic):Dynamic return poll(args),
                sendMessage:function(args:Dynamic):Dynamic return send(args)
            }};
        }
        if (ExternalInterface.available) ExternalInterface.addCallback("simPackaged", action);
        addEventListener(Event.ADDED_TO_STAGE, start);
    }
    function start(_:Event):Void {
        removeEventListener(Event.ADDED_TO_STAGE, start);
        var domain = new ApplicationDomain(null);
        isolated = !domain.hasDefinition("FCMServerBridge") && !ApplicationDomain.currentDomain.hasDefinition("FCMServerBridge");
        movie.contentLoaderInfo.addEventListener(Event.COMPLETE, function(_:Event):Void {
            isolated = isolated && domain.hasDefinition("FCMServerBridge")
                && !ApplicationDomain.currentDomain.hasDefinition("FCMServerBridge");
            emit("PACKAGED loaded provider=" + source + " isolated=" + isolated);
        });
        movie.contentLoaderInfo.addEventListener(IOErrorEvent.IO_ERROR, function(_:IOErrorEvent):Void { violation = true; emit("PACKAGED load failed"); });
        addChild(movie);
        movie.load(new URLRequest("/FCMServerBridge.swf"), new LoaderContext(false, domain));
    }
    function emit(value:String):Void { if (ExternalInterface.available) ExternalInterface.call("fcmSimLog", value); }
    function connect():Dynamic { connected = true; return {success:true}; }
    function disconnect():Dynamic { connected = false; disconnects++; return {success:true}; }
    function poll(args:Dynamic):Dynamic {
        polls++;
        if (args.max != 16) violation = true;
        var out = events.splice(0, 16);
        return {success:true,events:out};
    }
    function send(args:Dynamic):Dynamic {
        if (args.channel != "server" || !StringTools.startsWith(args.targetUserId, "FCMBRIDGE/1;")) {
            violation = true; return {success:false};
        }
        var next:String = args.targetUserId.substr("FCMBRIDGE/1;".length);
        if (args.body == "FCMCTL/1/LEAVE") { leaves++; bound = false; return {success:true}; }
        if (!StringTools.startsWith(args.body, "FCMCTL/1/ROSTER:")) { violation = true; return {success:false}; }
        controls++;
        var names:String = args.body.substr("FCMCTL/1/ROSTER:".length);
        acceptedNames = names == (phase == "hop" ? "NewPeer" : "PeerA|PeerB");
        if (!acceptedNames) violation = true;
        previousRequest = request; request = next;
        rebound = previousRequest != "" && request != previousRequest;
        events.push({id:++eventId,channel:"system",senderUserId:"system",
            body:"FCMCTL/1/SERVER-READY:" + next + "|r:isolated"});
        return {success:true};
    }
    function dispatch(verb:String, payload:String):Dynamic {
        if (verb == "log") {
            var entry:Dynamic = haxe.Json.parse(payload);
            var message:String = entry.message;
            if (message.indexOf("bound=true") >= 0) bound = true;
            else if (message.indexOf("bound=false") >= 0) bound = false;
            return "";
        }
        if (source != "zfe") { violation = true; return ""; }
        var args:Dynamic = haxe.Json.parse(payload);
        var result:Dynamic = switch verb {
            case "chat.v1.getRuntimeInfo": {success:true,capabilities:["zfe-chat-online-v1","zfe-chat-async-control-v1"]};
            case "chat.v1.connect": connect();
            case "chat.v1.disconnect": disconnect();
            case "chat.v1.getAuthState": {success:true,state:"authenticated"};
            case "chat.v1.pollEvents": poll(args);
            case "chat.v1.sendMessage": send(args);
            default: violation = true; {success:false};
        };
        return haxe.Json.stringify(result);
    }
    function publish(key:String, data:Dynamic, ready:Bool = true):Void {
        var value = new IsolatedProvider(data, ready);
        var found = false;
        for (entry in providers) if (entry.key == key) { entry.value = value; found = true; }
        if (!found) providers.push({key:key,value:value});
        for (entry in listeners.copy()) if (entry.key == key) entry.callback(new IsolatedEvent(value));
    }
    function roster(names:Array<String>, ready:Bool = true):Void {
        publish("MapMenuData", {MarkerData:[for (name in names) {markerType:"PlayerRemote",text:name}]}, ready);
    }
    function action(command:String):String {
        if (!disposed) switch command {
            case "loading": publish("MenuStackData", {menuStackA:[{menuName:"LoadingMenu"}]}); roster([]);
            case "resume": roster(["PeerB", "PeerA"]); publish("MenuStackData", {menuStackA:[]});
            case "hop": phase = "hop"; roster(["NewPeer"]);
            case "main-menu": publish("MenuStackData", {menuStackA:[{menuName:"MainMenu"}]});
            case "unload":
                disposed = true;
                removeChild(movie); // Production REMOVED_FROM_STAGE owns shutdown.
                movie.unloadAndStop(true);
            case "snapshot":
            default: violation = true;
        }
        return haxe.Json.stringify({provider:source,isolated:isolated,connected:connected,bound:bound,
            controls:controls,leaves:leaves,polls:polls,disconnects:disconnects,subscriptions:listeners.length,
            acceptedNames:acceptedNames,rebound:rebound,violation:violation,disposed:disposed});
    }
}

/** Separate-domain, accessor-backed objects. No production helpers are linked here. */
@:keep private class IsolatedProvider {
    var payload:Dynamic;
    var ready:Bool;
    public function new(payload:Dynamic, ready:Bool) { this.payload = payload; this.ready = ready; }
    @:getter(data) public function readData():Dynamic return payload;
    @:getter(dataReady) public function readReady():Bool return ready;
    @:getter(isTest) public function readTest():Bool return false;
}
@:keep private class IsolatedEvent {
    var provider:Dynamic;
    public function new(provider:Dynamic) { this.provider = provider; }
    @:getter(fromClient) public function readProvider():Dynamic return provider;
}
