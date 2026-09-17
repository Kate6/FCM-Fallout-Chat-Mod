/** Compiled production menu/movement contract; native viewport clipping remains game-only. */
@:access(FCMChatWidget)
@:access(SharedHUDTools)
class UltrawideScenario {
    static function check(ok:Bool, label:String):Void { if (!ok) throw label; }
    public static function start(widget:FCMChatWidget, provider:String):Void {
        try {
            var actions:Array<String> = [];
            for (branch in ["customize", "position", "panel_size", "text_size", "appearance", "auto_hide"]) {
                var items = SharedHUDTools.inspectMenu(branch);
                check(items.length > 0 && items.length <= 7, "bounded menu " + branch);
                for (item in items) actions.push(item.id);
            }
            for (item in widget._cfg.sizingMenu()) check(actions.indexOf(item.id) >= 0, "sizing reachable " + item.id);
            for (id in ["cz_left", "cz_right", "cz_up", "cz_down", "cz_position_reset", "cz_reset",
                "cz_opac_up", "cz_opac_dn", "cz_theme", "colors", "autohide", "cz_hide_delay_up", "cz_hide_delay_dn"])
                check(actions.indexOf(id) >= 0, "action reachable " + id);
            widget._cfg.x = 10;
            for (_ in 0...17) SharedHUDTools.selectMenu("cz_left");
            check(widget.x == -330 && widget._cfg.x == -330, "move past authored left edge");
            check(FcmConfig.parse(widget._cfg.toIni()).x == -330, "persist negative offset");
            widget._inputOpen = true;
            widget._nativeInput = false;
            widget.refreshSharedInputLayout();
            check(SharedHUDTools.active.x == widget.x + widget._cfg.inputRect().x, "editor follows negative offset");
            widget._inputOpen = false;
            widget._cfg.x = FcmConfig.MIN_X;
            SharedHUDTools.selectMenu("cz_left");
            check(widget.x == FcmConfig.MIN_X, "left safety bound");
            widget._cfg.x = FcmConfig.RIGHT_X - widget._cfg.width;
            SharedHUDTools.selectMenu("cz_right");
            check(widget.x == FcmConfig.RIGHT_X - widget._cfg.width, "right safety bound");
            var width = widget._cfg.width;
            SharedHUDTools.selectMenu("cz_position_reset");
            check(widget.x == 10 && widget.y == 10 && widget._cfg.width == width, "recover position without resetting size");
            flash.Lib.trace("ULTRAWIDE PASS " + provider + " negative=preserved menus=bounded editor=aligned reset=recovered");
        } catch (error:Dynamic) {
            flash.Lib.trace("ULTRAWIDE FAIL " + provider + " " + Std.string(error));
        }
    }
}
