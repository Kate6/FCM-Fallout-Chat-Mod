class TestFcmFeedPlan {
    static function check(label:String, ok:Bool):Void {
        if (!ok) throw label;
    }

    static function main():Void {
        // needsEmojiPass prefilter.
        check("null body skips emoji", !FcmFeedPlan.needsEmojiPass(null));
        check("empty body skips emoji", !FcmFeedPlan.needsEmojiPass(""));
        check("plain ascii skips emoji", !FcmFeedPlan.needsEmojiPass("hello world 123!?"));
        check("shortcode colon needs pass", FcmFeedPlan.needsEmojiPass("hello :vaultboy:"));
        check("discord markup needs pass", FcmFeedPlan.needsEmojiPass("hi <:wave:123456789012345678>"));
        check("unicode emoji needs pass", FcmFeedPlan.needsEmojiPass("good morning \u{1F600}"));
        check("time-like colon is a safe false positive", FcmFeedPlan.needsEmojiPass("meet at 12:30"));

        // recordKey identity precedence.
        var durable = FcmFeedPlan.recordKey("global", "m-1", "txn-9", true);
        var sameDurable = FcmFeedPlan.recordKey("global", "m-1", "", false);
        check("durable id wins over transaction token", durable == sameDurable);
        var pendingTxn = FcmFeedPlan.recordKey("global", "", "txn-1", true);
        var ackedTxn = FcmFeedPlan.recordKey("global", "", "txn-1", false);
        check("pending flip changes transaction key", pendingTxn != ackedTxn);
        var otherChannel = FcmFeedPlan.recordKey("trade", "m-1", "", false);
        check("channel scopes the key", durable != otherChannel);
        var beforeEdit = FcmFeedPlan.recordKey("global", "m-1", "", false, "hello", "");
        var afterEdit = FcmFeedPlan.recordKey("global", "m-1", "", false, "hello edited", "");
        check("in-place body edit changes the key", beforeEdit != afterEdit);
        var beforeLink = FcmFeedPlan.recordKey("global", "m-1", "", false, "see this", "");
        var afterLink = FcmFeedPlan.recordKey("global", "m-1", "", false, "see this", "https://example.com/x");
        check("link resolution change changes the key", beforeLink != afterLink);
        var sameContent = FcmFeedPlan.recordKey("global", "m-1", "", false, "hello", "");
        check("identical content reuses", beforeEdit == sameContent);

        // prefixReuseCount.
        var oldKeys = [durable, pendingTxn, FcmFeedPlan.recordKey("trade", "m-2", "", false)];
        var appended = oldKeys.concat([FcmFeedPlan.recordKey("trade", "m-3", "", false)]);
        check("tail append reuses the full prefix", FcmFeedPlan.prefixReuseCount(oldKeys, appended) == 3);
        var changedMiddle = [durable, ackedTxn, FcmFeedPlan.recordKey("trade", "m-2", "", false)];
        check("pending flip stops reuse at the changed row",
            FcmFeedPlan.prefixReuseCount(oldKeys, changedMiddle) == 1);
        var prepended = [FcmFeedPlan.recordKey("global", "m-0", "", false)].concat(oldKeys);
        check("prepend invalidates prefix reuse", FcmFeedPlan.prefixReuseCount(oldKeys, prepended) == 0);
        check("null inputs reuse nothing", FcmFeedPlan.prefixReuseCount(null, appended) == 0);
        var identityLess = [durable, FcmFeedPlan.recordKey("global", "", "", false)];
        check("identity-less rows never reuse",
            FcmFeedPlan.prefixReuseCount(identityLess, identityLess) == 1);

        // nextSliceSize adaptive bounds.
        check("cheap slice grows", FcmFeedPlan.nextSliceSize(6, 2.0) == 7);
        check("expensive slice shrinks", FcmFeedPlan.nextSliceSize(6, 20.0) == 5);
        check("nominal slice holds", FcmFeedPlan.nextSliceSize(6, 8.0) == 6);
        check("slice clamps at max", FcmFeedPlan.nextSliceSize(12, 1.0) == 12);
        check("slice clamps at min", FcmFeedPlan.nextSliceSize(4, 99.0) == 4);
        check("out-of-range input clamps first",
            FcmFeedPlan.nextSliceSize(99, 8.0) == FcmFeedPlan.MAX_SLICE_ROWS);

        // Coalescer: bursts collapse into one tick.
        var coalescer = new FcmRenderCoalescer();
        check("first request schedules the tick", coalescer.request());
        check("tick is scheduled", coalescer.isScheduled());
        check("second burst request does not reschedule", !coalescer.request());
        check("dirty survives the burst", coalescer.isDirty());
        check("tick renders once", coalescer.consumeTick());
        check("tick clears scheduled flag", !coalescer.isScheduled());
        check("idle tick renders nothing", !coalescer.consumeTick());
        check("new burst after idle reschedules", coalescer.request());
        coalescer.reset();
        check("reset drops the pending render", !coalescer.isDirty() && !coalescer.isScheduled());

        Sys.println("FCM feed-plan tests passed");
    }
}
