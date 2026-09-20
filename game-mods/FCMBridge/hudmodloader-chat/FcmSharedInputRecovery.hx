package;

/** Pure decision helper for a SharedHUDTools editor that disappears without a callback. */
class FcmSharedInputRecovery {
    public static inline var WAIT:String = "wait";
    public static inline var CANCEL:String = "cancel";
    public static inline var SUBMIT:String = "submit";

    public static function decide(hadEditor:Bool, focusLostMs:Float, graceMs:Float,
        submitArmed:Bool, cancelArmed:Bool, draftLength:Int):String {
        if (!hadEditor || focusLostMs < graceMs) return WAIT;
        if (submitArmed && !cancelArmed && draftLength > 0) return SUBMIT;
        return CANCEL;
    }

    /** Preserve a complete draft across transient empty SharedHUDTools observations. */
    public static function stableDraft(previous:String, observed:String, allowEmpty:Bool):String {
        var before:String = previous == null ? "" : previous;
        var current:String = observed == null ? "" : observed;
        if (current.length > 0 || allowEmpty || before.length == 0) return current;
        return before;
    }
}
