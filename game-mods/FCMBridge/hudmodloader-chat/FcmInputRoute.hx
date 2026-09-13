/** Provider-aware input routing for the one shared widget build. */
class FcmInputRoute {
    public static inline var NATIVE:String = "native";
    public static inline var SHARED:String = "shared";

    /** Both use the visible host editor; only ZFE can recover through its native buffer. */
    public static function preferred(provider:String, nativeUsable:Bool):String {
        return SHARED;
    }

    public static function mayUseNativeFallback(provider:String, nativeUsable:Bool):Bool {
        return provider == FcmNativeApi.ZFE && nativeUsable;
    }
}
