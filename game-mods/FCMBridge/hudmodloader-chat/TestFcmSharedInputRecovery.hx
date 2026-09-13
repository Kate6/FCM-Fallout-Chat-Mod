class TestFcmSharedInputRecovery {
    static function check(label:String, ok:Bool):Void {
        if (!ok) throw label;
    }

    static function main():Void {
        check("waits until an editor has been observed",
            FcmSharedInputRecovery.decide(false, 500, 225, true, false, 5) == FcmSharedInputRecovery.WAIT);
        check("allows a delayed normal callback",
            FcmSharedInputRecovery.decide(true, 150, 225, true, false, 5) == FcmSharedInputRecovery.WAIT);
        check("recovers an Enter submission when the host callback is lost",
            FcmSharedInputRecovery.decide(true, 225, 225, true, false, 5) == FcmSharedInputRecovery.SUBMIT);
        check("does not submit an empty draft",
            FcmSharedInputRecovery.decide(true, 300, 225, true, false, 0) == FcmSharedInputRecovery.CANCEL);
        check("Escape wins over a preceding submit signal",
            FcmSharedInputRecovery.decide(true, 300, 225, true, true, 5) == FcmSharedInputRecovery.CANCEL);
        check("unexplained focus loss releases the stale session",
            FcmSharedInputRecovery.decide(true, 300, 225, false, false, 5) == FcmSharedInputRecovery.CANCEL);
        Sys.println("FCM shared-input recovery tests passed");
    }
}
