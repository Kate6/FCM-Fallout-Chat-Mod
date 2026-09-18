/** Compiled production menu/movement contract; native viewport clipping remains game-only. */
@:access(FCMChatWidget)
@:access(SharedHUDTools)
class UltrawideScenario {
    static function check(ok:Bool, label:String):Void { if (!ok) throw label; }
    public static function start(widget:FCMChatWidget, provider:String):Void {
        var attempts = 0;
        var timer = new haxe.Timer(50);
        timer.run = function():Void {
            if (widget._disposed) { timer.stop(); return; }
            if (!widget._hudToolsRegistered) {
                if (++attempts < 100) return;
                timer.stop();
                flash.Lib.trace("ULTRAWIDE FAIL " + provider + " HUDTools registration timeout");
                return;
            }
            timer.stop();
            verify(widget, provider);
        };
    }
    static function verify(widget:FCMChatWidget, provider:String):Void {
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
            verifyViewport(widget);
            flash.Lib.trace("ULTRAWIDE PASS " + provider + " negative=preserved menus=bounded editor=aligned reset=recovered");
        } catch (error:Dynamic) {
            flash.Lib.trace("ULTRAWIDE FAIL " + provider + " " + Std.string(error));
        }
    }
    static function verifyViewport(widget:FCMChatWidget):Void {
        // Exercise every real submenu and verify the host's four-level limit.
        var pending = [{id:"customize", depth:2}];
        var branches:Array<String> = [];
        while (pending.length > 0) {
            var next = pending.shift();
            check(next.depth <= 4, "host submenu depth " + next.id);
            branches.push(next.id);
            for (item in SharedHUDTools.inspectMenu(next.id))
                if (item.isMenu) pending.push({id:item.id, depth:next.depth + 1});
        }
        var container = new flash.display.Sprite();
        container.x = 100; container.y = 50; container.scaleX = 1.25; container.scaleY = 0.8;
        widget.stage.addChild(container);
        try {
            for (upward in [true, false]) for (branch in branches) {
                var root = new HUDToolsMenu();
                container.addChild(root);
                var menu = new HUDToolsMenu(); root.addChild(menu);
                menu.x = 1850; menu.y = upward ? -100 : 1100;
                menu.rows(SharedHUDTools.inspectMenu(branch).length, upward);
                var nested = new HUDToolsMenu(); menu.addChild(nested);
                nested.x = 150; nested.y = -300; nested.rows(7, upward);
                // Invisible branches must not affect the measured column.
                var hidden = new HUDToolsMenu(); root.addChild(hidden);
                hidden.visible = false; hidden.x = -9999; hidden.rows(30, true);
                var guard = new FcmMenuViewport();
                for (size in [{w:1920, h:1080}, {w:3440, h:1440}, {w:5120, h:1440}, {w:400, h:240}]) {
                    guard.update(widget.stage, size.w, size.h, "FCMChatWidget");
                    for (column in [menu, nested]) for (i in 0...column.numChildren) {
                        var button = column.getChildAt(i);
                        if (!Std.isOfType(button, HUDButton)) continue;
                        var bounds = button.getBounds(widget.stage);
                        check(bounds.x >= 7.9 && bounds.y >= 7.9
                            && bounds.right <= size.w - 7.9 && bounds.bottom <= size.h - 7.9,
                            "visible column inside frame " + branch);
                    }
                }
                check(hidden.x == -9999, "hidden mod unchanged");
                root.selectedVendor = "AnotherMod";
                menu.x = -500;
                guard.update(widget.stage, 1920, 1080, "FCMChatWidget");
                check(menu.x == -500, "other selected mod unchanged");
                container.removeChild(root);
            }
            // The production frame listener, not only direct helper calls, must correct it.
            var liveRoot = new HUDToolsMenu(); container.addChild(liveRoot);
            var liveMenu = new HUDToolsMenu(); liveRoot.addChild(liveMenu);
            liveMenu.rows(7, true); liveMenu.x = -500; liveMenu.y = -500;
            var tools = SharedHUDTools.active;
            var wasActive = tools.isActive;
            tools.isActive = true;
            widget.stage.dispatchEvent(new flash.events.Event(flash.events.Event.ENTER_FRAME));
            var liveBounds = liveMenu.getBounds(widget.stage);
            check(liveBounds.x >= 7.9 && liveBounds.y >= 7.9
                && liveBounds.right <= widget.stage.stageWidth - 7.9
                && liveBounds.bottom <= widget.stage.stageHeight - 7.9, "production frame listener");
            tools.isActive = wasActive;
            widget.stage.dispatchEvent(new flash.events.Event(flash.events.Event.ENTER_FRAME));
            widget.stage.removeChild(container);
        } catch (error:Dynamic) {
            if (container.parent != null) container.parent.removeChild(container);
            throw error;
        }
        flash.Lib.trace("MENU-FRAME PASS branches=" + branches.length + " edges=all transforms=scaled viewport=16:9,21:9,32:9,small ownership=FCM-only");
    }

}
