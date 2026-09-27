using System.Security.Claims;

namespace Waylorn.ControlPlane.Api;

public static class AccessPolicy
{
    public static Guid OrganizationId(ClaimsPrincipal principal) =>
        Guid.TryParse(principal.FindFirstValue("org_id"), out var id) ? id : Guid.Empty;

    public static string Subject(ClaimsPrincipal principal) => principal.FindFirstValue("sub") ?? "";

    public static bool HasSite(ClaimsPrincipal principal, Guid siteId) =>
        principal.FindAll("site_id").Any(x => x.Value == "*" ||
            (Guid.TryParse(x.Value, out var allowed) && allowed == siteId));

    public static bool HasRole(ClaimsPrincipal principal, string role) =>
        principal.FindAll("waylorn_role").Any(x => x.Value == role);

    public static bool CanRead(ClaimsPrincipal principal, Guid siteId) =>
        OrganizationId(principal) != Guid.Empty && HasSite(principal, siteId) &&
        (HasRole(principal, "Viewer") || HasRole(principal, "Operator") || HasRole(principal, "Administrator"));

    public static bool CanEdit(ClaimsPrincipal principal, Guid siteId) =>
        OrganizationId(principal) != Guid.Empty && HasSite(principal, siteId) &&
        HasRole(principal, "Administrator");

    public static bool CanRequest(ClaimsPrincipal principal, Guid siteId) =>
        OrganizationId(principal) != Guid.Empty && HasSite(principal, siteId) &&
        (HasRole(principal, "Operator") || HasRole(principal, "Administrator"));

    public static bool CanApprove(ClaimsPrincipal principal, Guid siteId) =>
        OrganizationId(principal) != Guid.Empty && HasSite(principal, siteId) &&
        HasRole(principal, "Approver") && principal.FindFirstValue("principal_type") == "human";

    public static bool HasStrongAuthentication(ClaimsPrincipal principal) =>
        principal.FindAll("amr").Any(x => x.Value is "mfa" or "otp" or "webauthn");
}
