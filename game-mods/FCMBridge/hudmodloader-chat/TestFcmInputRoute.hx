class TestFcmInputRoute {
    static function check(label:String, ok:Bool):Void {
        if (!ok) throw label;
    }

    static function main():Void {
        check("ZFE prefers the visible shared editor",
            FcmInputRoute.preferred(FcmNativeApi.ZFE, true) == FcmInputRoute.SHARED);
        check("ZFE keeps the shared editor when native input is unavailable",
            FcmInputRoute.preferred(FcmNativeApi.ZFE, false) == FcmInputRoute.SHARED);
        check("xScal uses SharedHUDTools",
            FcmInputRoute.preferred(FcmNativeApi.XSCAL, true) == FcmInputRoute.SHARED);
        check("unknown providers fail closed to the shared host editor",
            FcmInputRoute.preferred("unknown", true) == FcmInputRoute.SHARED);
        check("ZFE may use native fallback",
            FcmInputRoute.mayUseNativeFallback(FcmNativeApi.ZFE, true));
        check("xScal cannot use ZFE native fallback",
            !FcmInputRoute.mayUseNativeFallback(FcmNativeApi.XSCAL, true));
        Sys.println("FCM provider input-route tests passed");
    }
}
