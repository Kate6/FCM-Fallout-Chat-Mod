/** Menu geometry fixture: upstream HUDButton uses 150x30 authored units. */
class HUDButton extends flash.display.Sprite {
    public function new() {
        super();
        graphics.beginFill(0x333333);
        graphics.drawRect(0, 0, 150, 30);
        graphics.endFill();
    }
}
