import Foundation

/// Keeps a debug build's localhost preview off production Convex. Two layers:
/// a WebKit content rule that blocks every request to the production
/// deployment, and a script that replaces the page with a refusal the moment
/// the page tries to open it, so the preview is visibly refused rather than
/// quietly broken. Release builds load only the production Portal and skip it.
public enum ConvexGuard {
    public static let ruleListIdentifier = "warehaus-debug-convex-guard"

    /// WebKit content blocker JSON: block any URL naming the production deployment.
    public static var contentRules: String {
        let pattern = ".*" + PortalOrigins.productionConvexDeployment.replacingOccurrences(of: "-", with: "\\-") + ".*"
        return ShellScript.json([["trigger": ["url-filter": pattern], "action": ["type": "block"]]])
    }

    public static let refusal = "This debug build refuses a Portal that uses production Convex (\(PortalOrigins.productionConvexDeployment)). Run the preview against shared dev."

    /// Runs at document start in every frame of a debug build.
    public static var userScript: String {
        let bad = ShellScript.json(PortalOrigins.productionConvexDeployment)
        let message = ShellScript.json(refusal)
        return """
        (function(){var bad=\(bad),msg=\(message);
        function refuse(u){try{document.documentElement.innerHTML='<body style="font:14px -apple-system;padding:64px 32px"></body>';document.body.textContent=msg;}catch(e){}throw new Error(msg);}
        function check(u){if(String(u&&u.url||u).indexOf(bad)!==-1)refuse(u);}
        var WS=window.WebSocket;if(WS){window.WebSocket=function(u,p){check(u);return p===undefined?new WS(u):new WS(u,p);};window.WebSocket.prototype=WS.prototype;['CONNECTING','OPEN','CLOSING','CLOSED'].forEach(function(k){window.WebSocket[k]=WS[k];});}
        var f=window.fetch;if(f){window.fetch=function(i,o){check(i);return f.call(this,i,o);};}
        var open=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){check(u);return open.apply(this,arguments);};
        var ES=window.EventSource;if(ES){window.EventSource=function(u,o){check(u);return new ES(u,o);};window.EventSource.prototype=ES.prototype;}
        })();
        """
    }
}
