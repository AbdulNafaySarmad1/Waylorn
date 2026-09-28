using System.Security.Cryptography;
using System.Text.Json;
using Waylorn.ControlPlane.Domain;

namespace Waylorn.ControlPlane.Application;

public sealed class AuditIntegrity
{
    public static AuditIntegrity Disabled { get; } = new(null, null);
    private readonly byte[]? key;
    public string? KeyId { get; }

    private AuditIntegrity(string? keyId, byte[]? key)
    {
        KeyId = keyId;
        this.key = key;
    }

    public static AuditIntegrity FromConfiguration(IConfiguration configuration, bool required)
    {
        var encoded = configuration["Audit:SigningKey"];
        var keyId = configuration["Audit:KeyId"];
        if (string.IsNullOrWhiteSpace(encoded) && string.IsNullOrWhiteSpace(keyId))
        {
            if (required) throw new InvalidOperationException("Audit signing key and key ID are required outside Development.");
            return Disabled;
        }
        if (string.IsNullOrWhiteSpace(encoded) || string.IsNullOrWhiteSpace(keyId) ||
            keyId.Length > 40 || !keyId.All(c => char.IsAsciiLetterOrDigit(c) || c is '-' or '_' or '.'))
            throw new InvalidOperationException("Audit signing key and a valid key ID must be configured together.");
        byte[] bytes;
        try { bytes = Convert.FromBase64String(encoded); }
        catch (FormatException ex) { throw new InvalidOperationException("Audit signing key must be base64.", ex); }
        if (bytes.Length < 32) throw new InvalidOperationException("Audit signing key must contain at least 32 bytes.");
        return new AuditIntegrity(keyId, bytes);
    }

    public void Sign(AuditRecord record)
    {
        if (key is null) return;
        record.IntegrityKeyId = KeyId;
        record.IntegrityTag = Convert.ToHexString(HMACSHA256.HashData(key, Canonical(record)));
    }

    public string Verify(AuditRecord record)
    {
        if (record.IntegrityTag is null || record.IntegrityKeyId is null ||
            key is null || record.IntegrityKeyId != KeyId) return "unverified";
        byte[] supplied;
        try { supplied = Convert.FromHexString(record.IntegrityTag); }
        catch (FormatException) { return "broken"; }
        var expected = HMACSHA256.HashData(key, Canonical(record));
        return CryptographicOperations.FixedTimeEquals(expected, supplied) ? "verified" : "broken";
    }

    private static byte[] Canonical(AuditRecord record) => JsonSerializer.SerializeToUtf8Bytes(new
    {
        version = 1, record.Id, record.OrganizationId, record.SiteId,
        record.Principal, record.Action, record.TargetType, record.TargetId,
        record.Outcome, atUtc = record.AtUtc.ToUniversalTime().ToString("O")
    });
}
