/** Pure viewport math; positions and sizes must use the same coordinate space. */
class FcmMenuPlacement {
    public static function shift(start:Float, size:Float, extent:Float, padding:Float = 8):Float {
        if (!Math.isFinite(start) || !Math.isFinite(size) || !Math.isFinite(extent)
            || size < 0 || extent <= padding * 2) return 0;
        if (start < padding) return padding - start;
        if (start + size > extent - padding) return extent - padding - start - size;
        return 0;
    }
}
