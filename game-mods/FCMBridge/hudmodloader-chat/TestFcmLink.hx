class TestFcmLink {
    static function check(label:String, value:Bool):Void {
        if (!value) throw label;
    }

    static function main():Void {
        var full = "https://discord.com/channels/123/456";
        check("extracts exact URL", FcmLink.firstUrl("See " + full + ".") == full);
        check("abbreviates links", FcmLink.abbreviateBody("See " + full + ".") == "See discord.com/....");
        check("keeps plain text", FcmLink.abbreviateBody("no link") == "no link");
        check("rejects script schemes", !FcmLink.validHttpUrl("javascript:alert(1)"));
        check("short host", FcmLink.displayUrl("https://example.com") == "example.com");
        check("ordinary HTTP link", FcmLink.firstUrl("http://example.com/articles/42") == "http://example.com/articles/42");
        check("shortens every regular link", FcmLink.abbreviateBody(
            "https://example.com/one and http://falloutchatmod.com/two")
            == "example.com/... and falloutchatmod.com/...");
        check("link next to emoji stays discoverable", FcmLink.firstUrl(
            ":vaultboy: https://example.com/path") == "https://example.com/path");
        trace("TestFcmLink OK");
    }
}
