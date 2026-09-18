# ZFE Browser Links v1 for Fallout Chat Mod authors

Status: **HYPOTHESIS / IMPLEMENTATION TARGET. Specified, not implemented or tested in game.** This is the ZFE-defined v1 contract. The requirements below govern the ZFE implementation and FCM integration. FCM must use capability discovery before enabling the feature.

## Scope and ownership

ZFE will supply the browser service in its DLL through the general '__ZFE.call' bridge. FCM owns link display, activation, slash commands, and input handling. ZFE owns URL validation, action admission, permissions, consent dialogs, persistence, browser dispatch, bounded request state, and results. Users manage permissions through files in v1. No FCM settings button, separate permission manager, additional ZFE executable, or browser-specific chat protocol is required.

The capability is 'zfe-browser-v1', reported by the general 'getRuntimeInfo' in both 'dxgi-core' and 'dxgi-chat' only after ZFE completes implementation and acceptance. FCM MUST check it independently of chat capability; FCM still requires its existing chat-enabled provider for chat. If absent, FCM keeps chat usable and leaves links readable. A bridge call, vendor string, relay field, callback, or displayed message is never proof of player intent.

## Action admission

FCM MUST call 'browser.v1.beginAction' synchronously from the actual local link activation or local command handler. The payload has exactly one form:

```json
{"url":"https://example.org/wiki/Example#Build"}
```

or:

```json
{"origin":"https://example.org"}
```

'url' binds an immediate action to one exact validated UTF-8 URL. 'origin' binds a deferred command to HTTPS, a DNS host, and effective port 443, with no userinfo, path, query, or fragment. An optional root slash is accepted. Hosts are validated ASCII DNS or IDN Punycode. IP literals, local names, trailing-dot ambiguity, and malformed authorities are rejected.

ZFE verifies the action itself. A successful response is:

```json
{"success":true,"actionId":"opaque-action-id","expiresInMs":15000}
```

ZFE does not launch or prompt at 'beginAction'. Repeating it for the same activation and scope returns the same action ID without extending its expiry. Different scope on that activation returns 'action_conflict'. Each originating UI flow has at most one unconsumed action; a later real activation invalidates its older unused action. There are at most four unconsumed actions globally; exhausted capacity returns 'busy'. Unused IDs expire after 15 seconds. IDs are opaque, belong to their originating UI and bridge, and MUST NOT be persisted or transferred between game, bridge, or UI lifetimes.

Validation, binding, busy, capacity, and rate rejections leave an otherwise valid action unconsumed. Request acceptance consumes it atomically. Denial, cancellation, expiry, failure, or an uncertain launch never restores it.

## URL request

FCM MUST call 'browser.v1.request' with exactly:

```json
{"actionId":"opaque-action-id","url":"https://example.org/wiki/Example#Build"}
```

For every method, the JSON payload limit is 32768 UTF-8 bytes. The decoded URL limit is 4096 UTF-8 bytes. Unknown fields, duplicate fields, wrong types, missing fields, and malformed JSON are rejected. ZFE accepts absolute HTTPS only on effective port 443 and never upgrades or repairs input. Oversized input is rejected, never truncated.

For origin comparison, scheme and host are case-insensitive and explicit 443 equals implicit 443. ZFE uses the lower-case validated ASCII DNS host; internationalized hosts must be supplied in valid Punycode. ZFE rejects credentials, IP literals and unusual numeric IP forms, local names, trailing-dot ambiguity, controls, misleading direction-control characters, backslashes, malformed percent escapes, and other schemes. Path, query, and fragment are preserved exactly, including wiki anchors and camp sharing data. These checks do not certify a website or its subsequent redirects.

For a URL action, the request URL MUST match the original validated UTF-8 URL byte for byte, even where origin comparison would consider two spellings equivalent. For an origin action, it must have the same validated origin. A binding mismatch returns 'action_conflict'. Acceptance returns a request snapshot, for example:

```json
{"success":true,"requestId":"opaque-request-id","state":"accepted","terminal":false}
```

The request ID is opaque. Repeating the same accepted action ID and identical URL returns the existing request ID and current snapshot during its lifetime and retention, even after the unused-action expiry time. A changed URL is 'action_conflict'. After retention, the old action can never become a fresh launch. FCM MUST NOT automatically retry a rejected or uncertain operation; further attempts require fresh player action.

## Lifecycle and limits

Non-terminal states are 'accepted', 'pending_confirmation', and 'launching'. Terminal states are 'handed_off', 'denied', 'cancelled', 'expired', 'failed', and 'launch_unknown'. Successful 'request', 'poll', and 'cancel' snapshots contain 'requestId', 'state', and 'terminal'. API 'success' means the call was answered; inspect 'state' for the browser outcome. A 'failed' snapshot can therefore have 'success' set to true and include error details. 'handed_off' means Windows accepted the launch, never that a page loaded.

After 10 seconds from dispatch without a definite result, ZFE returns terminal 'launch_unknown'. The browser may still open later. The snapshot remains immutable even if the operating system eventually responds. ZFE blocks another browser attempt while the original dispatch is unresolved, including after its public result expires. Neither ZFE nor FCM retries it automatically.

There is one globally active attempt and no queue; overlapping attempts return 'busy'. Throttle lasts until five seconds after the latest acceptance or dispatch start, whichever is later. Cancellation does not reset it. Requests expire 30 seconds after acceptance if dispatch has not begun, including confirmation time. Terminal snapshots live 60 seconds from completion, with at most 16 total request records; full capacity returns 'busy' rather than evicting retained records.

'browser.v1.poll' accepts:

```json
{"requestId":"opaque-request-id"}
```

It returns a stable snapshot, for example:

```json
{"success":true,"requestId":"opaque-request-id","state":"pending_confirmation","terminal":false}
```

FCM MUST poll no more frequently than every 250 milliseconds and only while non-terminal. Unknown, wrong-owner, wrong-lifetime, or forgotten IDs return 'request_not_found'; this does not establish whether a browser opened. Before source UI removal, bridge replacement, or reconnect, request cancellation if the original bridge is still callable, then stop polling and discard the IDs. Never replay after focus returns.

'browser.v1.cancel' accepts the same payload. Before launch it dismisses the prompt and returns terminal 'cancelled'. During 'launching' it returns 'cancel_too_late'. A terminal request returns its immutable snapshot, including 'launch_unknown'. Losing foreground before dispatch invalidates unused actions and cancels pending requests; focus transfer to ZFE's own dialog is allowed. Removing the originating UI or bridge also invalidates its pending work. Returning to the game never replays it. ZFE handles held-input release before launch, while FCM completes normal input cleanup.

Normal command submission may close the text-entry field without destroying its owning UI. That input cleanup alone does not cancel a command's action or accepted request. Destroying the owning UI does.

## Errors

Error codes are 'invalid_request', 'invalid_url', 'user_action_required', 'invalid_action', 'action_expired', 'action_conflict', 'disabled', 'busy', 'rate_limited', 'unavailable', 'no_browser', 'launch_failed', 'request_not_found', and 'cancel_too_late'. An immediate rejection has 'success' set to false and an 'error' object. A terminal 'failed' snapshot carries its failure code in the same 'error' object. Error messages are explanatory text, not values to branch on.

For 'rate_limited', 'error.retryAfterMs' is a positive integer indicating the earliest retry time, without authorizing a retry or extending an action:

```json
{"success":false,"error":{"code":"rate_limited","message":"Try again after a new player action.","retryAfterMs":4200}}
```

Unknown errors or unrecognized states stop the flow and leave chat and link text usable. FCM MUST NOT bypass ZFE using alternate providers, shell commands, executable targets, or fallback launchers.

## ZFE-owned permissions and file configuration

ZFE implements consent, policy decisions, and saving/loading of player permissions. FCM has no permission-management UI obligation. Mod authors may optionally package the site defaults below; FCM MUST NOT implement permission decisions or edit the player's 'zfe.ini' or BrowserPermissions file.

### Player controls in zfe.ini

The game's 'Data\configuration\zfe.ini' contains global controls and optional installation-wide site defaults:

```ini
; Values in zfe.ini win over fragment values.
[BrowserLinks]
Mode=remembered
UseModDefaults=true

[BrowserLinks.Sites]
https://example.org=ask
https://docs.example.org=block
```

'Mode' and 'UseModDefaults' are player-only controls; fragments cannot set them. 'UseModDefaults=false' ignores every mod-supplied site default. An absent value defaults to true; invalid or duplicate values disable mod defaults. Site values in 'zfe.ini' are 'allow', 'ask', or 'block'. An explicit 'ask' suppresses the corresponding fragment allowance. Keys are exact HTTPS origins under the same origin rules as 'beginAction'.

| Mode | Behavior after a valid player action |
| --- | --- |
| 'off' | Reject link requests with 'disabled'. The user can change the mode by editing 'zfe.ini'. |
| 'ask' | Respect effective blocks. Prompt for every other destination with Open once, Block this website, and Cancel. |
| 'remembered' | Default. Open effectively allowed exact origins automatically; deny blocked origins; otherwise prompt with Open once, Always allow this website, Block this website, and Cancel. |
| 'allow_all' | Skip every ZFE link confirmation, including the first. Ignore all per-site allow, ask, and block rules without deleting them. Require the same valid URL, player action, and request limits. |

The player's explicit option for no ZFE link confirmations is:

```ini
[BrowserLinks]
Mode=allow_all
```

An absent mode defaults to 'remembered'. Invalid or duplicate mode values or sections fall back to 'ask'. A valid explicit 'allow_all' operates independently of site-rule files. It never turns a received message into a player action; an unverified activation returns 'user_action_required' without a fallback prompt. Browser and operating system warnings remain outside ZFE control.

### Optional site defaults supplied with a mod

A mod using HUDModLoader may include this section in its matching configuration fragment:

```text
Data\ZFE\TextChat\fragments\<HMLModName>.ini
```

```ini
; Replace example.org with the specific site used by this mod.
; Values in zfe.ini win over fragment values.
[BrowserLinks.Sites]
https://example.org=allow
```

'<HMLModName>' matches the active 'Data\hudmodloader.ini' entry without its optional '.swf' suffix. Browser defaults are read from matching active mod fragments in both ZFE variants. Browser defaults from multiple active mods combine by exact origin; identical allowances count once. Existing chat settings in the same file retain their own behavior.

Only exact-origin 'allow' entries are accepted from fragments. They cannot set global mode, disable validation, introduce wildcards, replace player rules, or create authority to open links without a player action. Mod authors MUST disclose bundled sites and their purpose. A bundled allowance is the author's supplied default; ZFE does not certify that website as trusted. In 'remembered' mode it can skip a prompt after the player's own action. Like other site rules, enabled fragment defaults apply across supported ZFE mods in that game session. A fragment filename selects installed defaults; it does not authenticate a requesting mod.

A fragment can be at most 16 KiB and contain at most 128 browser origins. An invalid browser section supplies no allowances from that file; valid sibling fragments remain eligible and unrelated chat settings retain their own behavior. V1 accepts at most 64 active fragments and 1024 distinct fragment origins; exceeding aggregate limits disables fragment allowances for that launch. Unsafe or ambiguous mod names supply no fragment defaults. Inactive, removed, or unmatched fragments contribute no defaults on the next launch. Defaults are never copied into the player's permission file.

### Player rules and precedence

ZFE creates a readable player file at:

```text
<Windows Documents>\My Games\Fallout 76\ZFE\BrowserPermissions\<installation-id>.json
```

The actual Windows Documents folder is resolved, including redirection or OneDrive. The installation ID is stable for the same game installation path across game and DLL updates; another installation gets its own file. ZFE creates an empty 'sites' object without granting permission. Preserve the generated installation ID when editing. Example contents after the user adds rules:

```json
{
  "schemaVersion": 1,
  "installationId": "<installation-id>",
  "sites": {
    "https://example.org": "ask",
    "https://docs.example.org": "block"
  }
}
```

The file uses strict JSON and contains no browsing history, full requested URLs, or duplicate global mode. Player site values are 'allow', 'ask', or 'block'. ZFE saves consent choices here. Site rules apply across supported ZFE mods, with no wildcards or implicit subdomain permissions. All three sources compare normalized origin keys: lower-case HTTPS scheme and validated ASCII/Punycode host, with no trailing slash or explicit default port. Equivalent ':443' and root-slash input normalize to that same key. Duplicate handling applies after this normalization.

Global mode is applied first. A session block from an unsaved Block choice overrides all stored site rules until the game exits. Otherwise, for each site, the first applicable rule in this order wins:

1. The player's BrowserPermissions JSON rule.
2. The same site's rule in 'zfe.ini'.
3. An active fragment allowance, if 'UseModDefaults' is enabled.
4. Ask the player.

Thus 'zfe.ini' overrides fragment values per origin, while explicit per-user decisions override site defaults in either source. 'Mode=ask' still asks even for an allowed site; 'Mode=off' still rejects; explicit 'Mode=allow_all' overrides all site rules, including blocks.

To revoke an inherited allowance, set that site to 'ask' in the player JSON; use 'block' to prevent opening. Removing an entry or deleting the file restores lower-priority defaults, which can include bundled allowances. To stop using every bundled allowance, set 'UseModDefaults=false'. This preserves independent player and 'zfe.ini' site rules.

### Loading, saving, and confirmation

Edit the files while the game is closed. Player files, fragments, and active fragment membership are loaded at game launch; manual changes apply on the next launch. Successfully saved consent choices apply immediately. Switching global modes preserves site rules. ZFE rechecks the adopted mode and applicable rule before dispatch.

A missing or valid empty player file starts with no personal rules and inherits defaults. An existing unreadable, malformed, mismatched, or unsupported file contributes no personal rules and turns inherited 'allow' values from both 'zfe.ini' and fragments into 'ask' for that launch; known 'zfe.ini' blocks still deny. An explicit valid 'allow_all' remains independent. Invalid values or duplicate normalized site keys in 'zfe.ini' become 'ask' at that layer, never fall back to a fragment allowance for that origin. An unparseable browser-site section or invalid origin key in 'zfe.ini' suppresses inherited automatic allowances for that launch. Duplicate normalized origins or invalid values make a player JSON file invalid.

A valid readable file can still supply rules when writing is unavailable. Failed saves never create a new permanent allowance or appear successful. ZFE explains the failure and offers explicit Open once when saving an allowance fails. A requested block still restricts the current session if saving fails, with a clear notice that it will not survive restart. ZFE refuses to overwrite a policy file changed since loading, never silently replaces a malformed policy, and never relocates permissions to another folder.

When confirmation is required, ZFE shows the canonical destination host prominently, makes the complete destination and permission-file location available, and shows the remaining decision time. Cancel is selected by default; Escape or close cancels only that request and does not change site rules. ZFE waits for the initiating controls to be released before accepting a separate approval action. Displayed URL text is literal; a mod label cannot replace the real host. Persistent success is shown only after saving. Open once creates no permanent rule.

ZFE opens the system's default browser and does not change that preference. Permission covers the initial destination; redirects and later browser decisions remain subject to normal browser protections. Mod-facing APIs provide no permission or browser-mode setter.

## FCM behavior

FCM MUST initiate only from deliberate local link activation or its own local command. It MUST NOT open from receipt, rendering, replay, echo, hover, or held-key repetition. An incoming link becomes eligible only after later local activation. FCM MUST escape untrusted markup and reveal the real destination host before activation, through visible link text or a pointer-hover and keyboard/controller-focus preview. A friendly label alone is insufficient. Do not put authentication secrets in URLs or log complete URLs, queries, fragments, or chat bodies for this feature.

For a delayed command, begin an origin-scoped action when the local command is submitted. Correlate one local result to that still-valid action, within 15 seconds and on the same origin, before requesting. A late, unknown-origin, or unrelated result remains a readable link requiring a new click. One action permits at most one open.

For an immediate link, FCM supplies 'api' from its existing bridge discovery and a JSON codec compatible with the shown 'JSON.parse' and 'JSON.stringify' calls. The following function runs inside the real click or keyboard/controller activation handler and returns the result to its caller:

```actionscript
function openLinkFromClick(api:Object, url:String):Object
{
   try
   {
      if (api == null) return null;
      var info:Object = JSON.parse(String(api.call("getRuntimeInfo", "{}")));
      if (info == null || info.success !== true) return null;
      var caps:Array = info.capabilities as Array;
      if (caps == null || caps.indexOf("zfe-browser-v1") < 0) return null;
      var action:Object = JSON.parse(String(api.call(
         "browser.v1.beginAction", JSON.stringify({url:url}))));
      if (action == null || !(action.success is Boolean)) return null;
      if (!action.success) return action;
      if (!(action.actionId is String) || action.actionId.length == 0)
         return null;
      var result:Object = JSON.parse(String(api.call(
         "browser.v1.request", JSON.stringify({
            actionId:action.actionId, url:url}))));
      if (result == null || !(result.success is Boolean)) return null;
      if (result.success && (!(result.requestId is String) ||
         result.requestId.length == 0 || !(result.state is String) ||
         !(result.terminal is Boolean))) return null;
      return result;
   }
   catch (error:Error) { return null; }
}
```

The caller MUST retain the returned 'requestId', handle an already terminal result immediately, and otherwise poll until terminal. A null result means unavailable or malformed response; keep the URL usable and do not retry. A result with 'success' set to false contains an API error. Retain action and request IDs only while relevant; never manufacture, persist, or transfer them.

FCM MUST keep a visible fallback for every failure, such as a selectable URL or an existing copy action. Treat denial and cancellation as ordinary user choices, without repeated prompts or chat-provider failure. Stop the polling timer on every terminal state, and perform the lifecycle cleanup above when the originating panel is destroyed. A reconnect or menu rebuild creates no authority to reopen a prior link.

## Deterministic cases

| Case | Required result |
| --- | --- |
| Capability absent | No browser call; chat and link text remain usable. |
| Valid origin with no applicable allowance or block in 'remembered' | Prompt; Open once creates no rule; persistent choices save only the selected exact-origin rule. |
| Saved approval after game or DLL update at the same installation | Reuse the exact-origin rule in 'remembered'. |
| New subdomain or lookalike hostname | No inherited approval; apply its own origin policy. |
| Saved approval in 'ask' | Prompt without an Always allow button. |
| Saved block in 'ask' | No open and no approval shortcut. |
| 'allow_all' with valid action and HTTPS | No ZFE prompt; normal dispatch. |
| Unverified activation in 'allow_all' | 'user_action_required'; no prompt or launch. |
| Incoming or replayed URL | Passive until later local activation. |
| Deferred result is late, uncorrelated, or on a different origin | Readable link requiring fresh activation; no automatic prompt. |
| Identical request using an already accepted action during retention | Same request ID and current snapshot; no second open. |
| Accepted action reused with a changed URL | 'action_conflict'; no second open. |
| Forgotten action ID or expired unused action | Reject; never interpret it as a new action. |
| Invalid scheme, credentials, local/IP host, malformed or oversized input | Reject without prompt or launch, including in 'allow_all'. |
| Wiki fragment or camp query in an accepted URL | Preserve exactly; never truncate or rewrite it. |
| Busy or rate-limited request | Reject without consuming a valid unused action; FCM performs no automatic retry. |
| Cancel during 'launching' | 'cancel_too_late'; no claim that opening was prevented. |
| Cancel a terminal request | Return its unchanged final snapshot. |
| External focus loss before dispatch | Cancel pending work; returning does not replay it. |
| Text-entry field closes after local command submission | Keep the action valid while its owning UI, bridge, and foreground remain valid. |
| Active fragment allows a new site in 'remembered' | Open after a valid player action unless a higher-priority rule applies. |
| Same site allowed by fragment but set to 'ask' in 'zfe.ini' | Prompt, unless an explicit player JSON rule overrides that site default. |
| Player JSON blocks a fragment-allowed site | Deny in 'ask' and 'remembered'. |
| Player JSON allows a site blocked only in 'zfe.ini' | The explicit per-user rule wins; open in 'remembered', prompt in global 'ask'. |
| Fragment attempts 'Mode=allow_all' | Ignore it; only the player's 'zfe.ini' can set that mode. |
| Player sets 'UseModDefaults=false' | Ignore fragment allowances; retain player and 'zfe.ini' site rules. |
| Player revokes a bundled allowance with a JSON 'ask' rule | Keep prompting after mod updates; never replace it with the fragment value. |
| Player removes a JSON site entry | Resume inheritance from 'zfe.ini' and enabled fragment defaults. |
| Saving a Block choice fails | Deny and retain a session block over all stored allowances; report that it was not saved. |
| Mod fragment is removed or its HML entry disabled | Remove its defaults at next launch; explicit player rules remain. |
| Corrupt player file in 'remembered' | Suppress automatic site allowances, including fragments; ask unless a known block denies. |
| Documents or INI save failure | Explain what was not saved; grant no new permanent allowance. |
| Browser unavailable | 'no_browser' or 'unavailable'; no alternate launcher. |
| No definite operating system result after 10 seconds | Terminal 'launch_unknown'; no retry, and no second attempt while unresolved. |
| UI removal or bridge replacement | Cancel and stop polling; never replay. |

ZFE owns acceptance of its action handling, native dialogs, persistence, and browser dispatch before publishing the capability. This includes FCM's supported input routes, keyboard, mouse, controller, fullscreen, windowed, borderless, Steam, and Game Pass. FCM owns conformance of its link UI and command handlers. Both must pass the applicable cases above; an unsupported route is a defect to resolve, never permission to bypass the contract.
