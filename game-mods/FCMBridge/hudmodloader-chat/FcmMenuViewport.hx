import flash.display.DisplayObject;
import flash.display.DisplayObjectContainer;
import flash.geom.Point;
import flash.geom.Rectangle;

/** Only reposition the visible FCM subtree of the public HUDTools display tree.
 * Contract: HUDToolsMenu.getSelectedModName(), HUDButton children, right-growing
 * menus in HUDModLoader 71e2fde134933323777980b5e0fd0c6036c2408f.
 * No private fields, host asset patches, or changes to another mod's columns.
 */
class FcmMenuViewport {
    var root:DisplayObjectContainer;
    public function new() {}
    public function clear():Void { root = null; }
    static function className(node:DisplayObject):String {
        return untyped __global__["flash.utils.getQualifiedClassName"](node);
    }
    static function isMenu(node:DisplayObject):Bool {
        return className(node) == "HUDToolsMenu";
    }
    function findRoot(host:DisplayObjectContainer):DisplayObjectContainer {
        var queue:Array<DisplayObjectContainer> = [host];
        var visited = 0;
        while (queue.length > 0 && visited++ < 2048) {
            var node = queue.shift();
            if (isMenu(node) && (node.parent == null || !isMenu(node.parent))) return node;
            for (i in 0...node.numChildren) {
                var child = node.getChildAt(i);
                if (Std.isOfType(child, DisplayObjectContainer) && queue.length < 2048)
                    queue.push(cast child);
            }
        }
        return null;
    }
    public function update(host:DisplayObjectContainer, width:Float, height:Float, vendor:String):Void {
        if (width <= 16 || height <= 16) return;
        if (root == null || root.stage == null) root = findRoot(host);
        if (root == null || !root.visible) return;
        var selected = Reflect.field(root, "getSelectedModName");
        if (selected == null || Reflect.callMethod(root, selected, []) != vendor) return;
        // The root has only one visible mod subtree. Hidden sibling mods are untouched.
        for (i in 0...root.numChildren) {
            var child = root.getChildAt(i);
            if (child.visible && isMenu(child)) fit(cast child, host, width, height, 0);
        }
    }
    static function columnBounds(menu:DisplayObjectContainer, host:DisplayObjectContainer):Rectangle {
        var bounds:Rectangle = null;
        for (i in 0...menu.numChildren) {
            var child = menu.getChildAt(i);
            // getBounds(menu) includes invisible descendants: measure only own buttons.
            if (!child.visible || className(child) != "HUDButton") continue;
            var rect = child.getBounds(host);
            bounds = bounds == null ? rect : bounds.union(rect);
        }
        return bounds;
    }
    static function fit(menu:DisplayObjectContainer, host:DisplayObjectContainer,
        width:Float, height:Float, depth:Int):Void {
        if (depth > 4 || menu.parent == null) return;
        var bounds = columnBounds(menu, host);
        if (bounds != null && bounds.width > 0 && bounds.height > 0) {
            var scale = Math.min(1, Math.min((width - 16) / bounds.width, (height - 16) / bounds.height));
            if (scale < 1) {
                menu.scaleX *= scale; menu.scaleY *= scale;
                bounds = columnBounds(menu, host);
            }
            var dx = FcmMenuPlacement.shift(bounds.x, bounds.width, width);
            var dy = FcmMenuPlacement.shift(bounds.y, bounds.height, height);
            // Convert the displacement through both parents; HUD tools may be scaled.
            var origin = menu.parent.globalToLocal(host.localToGlobal(new Point(0, 0)));
            var target = menu.parent.globalToLocal(host.localToGlobal(new Point(dx, dy)));
            menu.x += target.x - origin.x;
            menu.y += target.y - origin.y;
        }
        for (i in 0...menu.numChildren) {
            var child = menu.getChildAt(i);
            if (child.visible && isMenu(child)) fit(cast child, host, width, height, depth + 1);
        }
    }
}
