/** Public display-tree contract fixture; no production-private field access. */
class HUDToolsMenu extends flash.display.Sprite {
    public var selectedVendor:String = "FCMChatWidget";
    public function new() { super(); }
    public function getSelectedModName():String { return selectedVendor; }
    public function rows(count:Int, upward:Bool):Void {
        for (i in 0...count) {
            var button = new HUDButton();
            button.y = (i + 1) * (upward ? -30 : 30);
            addChild(button);
        }
    }
}
