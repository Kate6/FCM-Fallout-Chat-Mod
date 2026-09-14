import flash.display.Sprite;
import flash.events.Event;
import flash.events.KeyboardEvent;
import flash.external.ExternalInterface;
import MockXscal.SimLog;

class FCMHarness extends Sprite {
    public var __SFECodeObj:Dynamic;
    public var __ZFE:Dynamic;
    public var BSUIDataManager:Dynamic;
    var widget:FCMChatWidget;
    var provider:String = "xscal";

    static function main():Void {
        flash.Lib.current.addChild(new FCMHarness());
    }

    public function new() {
        super();
        addEventListener(Event.ADDED_TO_STAGE, onAddedToStage);
        try {
            var requested = Std.string(loaderInfo.parameters.provider).toLowerCase();
            if (requested == "zfe") provider = "zfe";
        } catch (_:Dynamic) {}
        if (provider == "zfe") __ZFE = MockZfe.root();
        else __SFECodeObj = MockXscal.root();
        MockXscal.loadScenario("/hosted-dev-snapshot.json");
        BSUIDataManager = MockGameData.manager();
        if (ExternalInterface.available) {
            ExternalInterface.addCallback("simDispatch", simDispatch);
            ExternalInterface.addCallback("simSubmit", simSubmit);
            ExternalInterface.addCallback("simSnapshot", simSnapshot);
            ExternalInterface.addCallback("simSetHudMode", simSetHudMode);
            ExternalInterface.call("fcmSimLog", "SIMULATED xScal host initialized");
        }
        // Keep the class linked so the production getDefinitionByName path resolves it.
        var sharedClass:Class<SharedHUDTools> = SharedHUDTools;
        try {
            widget = new FCMChatWidget();
            addChild(widget);
        } catch (error:Dynamic) {
            SimLog.emit("HARNESS widget construction failed: " + Std.string(error));
        }
    }

    function onAddedToStage(_:Event):Void {
        removeEventListener(Event.ADDED_TO_STAGE, onAddedToStage);
        stage.addEventListener(KeyboardEvent.KEY_DOWN, onStageKeyDown, false, 1000);
        stage.addEventListener(KeyboardEvent.KEY_UP, onStageKeyUp, false, 1000);
    }

    function onStageKeyDown(event:KeyboardEvent):Void {
        // Harness-only HUD-state controls. They let browser tests drive the same
        // BSUIDataManager subscription path without requiring game input automation.
        if (event.keyCode == 0x78) MockGameData.setHudMode("ContainerMode"); // F9
        if (event.keyCode == 0x79) MockGameData.setHudMode("All");           // F10
        if (provider == "zfe") MockZfe.handleKey(event.keyCode, event.charCode, true);
        dispatchVirtualKey(event.keyCode, true);
    }

    function onStageKeyUp(event:KeyboardEvent):Void {
        if (provider == "zfe") MockZfe.handleKey(event.keyCode, event.charCode, false);
        dispatchVirtualKey(event.keyCode, false);
    }

    function dispatchVirtualKey(keyCode:Int, down:Bool):Void {
        MockXscal.setVirtualKey(keyCode, down);
        var action = switch (keyCode) {
            case 0x2D: "INSERT";
            case 0x26: "Up";
            case 0x28: "Down";
            case 0x21: "PrevPage";
            case 0x22: "NextPage";
            case 0x2E: "DELETE";
            default:
                if (keyCode >= 0x41 && keyCode <= 0x5A) String.fromCharCode(keyCode)
                else if (keyCode >= 0x30 && keyCode <= 0x39) String.fromCharCode(keyCode)
                else if (keyCode >= 0x70 && keyCode <= 0x7B) "F" + (keyCode - 0x6F)
                else "";
        };
        if (action.length == 0) return;
        stage.dispatchEvent(new SimUserEvent(action, down));
    }

    function simDispatch(action:String, down:Bool):Bool {
        if (stage == null) return false;
        stage.dispatchEvent(new SimUserEvent(action, down));
        MockXscal.setPressed(action, down);
        return true;
    }

    function simSubmit(text:String):Bool {
        return SharedHUDTools.submitActive(text);
    }

    function simSetHudMode(mode:String):Bool {
        MockGameData.setHudMode(mode);
        return true;
    }

    function simSnapshot():String {
        return haxe.Json.stringify({
            provider: provider,
            editorActive: SharedHUDTools.hasActiveEditor(),
            callCount: MockXscal.callCount,
            pollCount: MockXscal.pollCount,
            historyDoneDeliveries: MockXscal.historyDoneDeliveries,
            logCount: SimLog.count
        });
    }
}

class SimUserEvent extends Event {
    public var EventName:String;
    public var IsKeyDown:Bool;
    public function new(action:String, down:Bool) {
        super("HUDMod::UserEvent", true, false);
        EventName = action;
        IsKeyDown = down;
    }
}
