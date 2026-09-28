using System.Security.Cryptography;
using System.Text.Json;
using Waylorn.ControlPlane.Domain;

namespace Waylorn.ControlPlane.Application;

public sealed class AuditIntegrity
{
    public static AuditIntegrity Disabled { get; } = new(null, null, new Dictionary<string, byte[]>());
    private readonly byte[]? signingKey;
    private readonly IReadOnlyDictionary<string, byte[]> verificationKeys;
    public string? KeyId { get; }

    private AuditIntegrity(string? keyId, byte[]? signingKey,
        IReadOnlyDictionary<string, byte[]> verificationKeys)
    {
        KeyId = keyId;
        this.signingKey = signingKey;
        this.verificationKeys = verificationKeys;
    }

    public static AuditIntegrity FromConfiguration(IConfiguration configuration, bool required)
    {
        var encoded = configuration["Audit:SigningKey"];
        var keyId = configuration["Audit:KeyId"];
        if (string.IsNullOrWhiteSpace(encoded) != string.IsNullOrWhiteSpace(keyId) ||
            keyId is not null && !ValidKeyId(keyId))
            throw new InvalidOperationException("Audit signing key and a valid key ID must be configured together.");
        if (required && string.IsNullOrWhiteSpace(encoded))
            throw new InvalidOperationException("Audit signing key and key ID are required outside Development.");

        var verificationKeys = new Dictionary<string, byte[]>(StringComparer.Ordinal);
        foreach (var historical in configuration.GetSection("Audit:VerificationKeys").GetChildren())
        {
            if (!ValidKeyId(historical.Key) || string.IsNullOrWhiteSpace(historical.Value))
                throw new InvalidOperationException("Audit verification keys require valid IDs and values.");
            verificationKeys.Add(historical.Key, ParseKey(historical.Value));
        }
        if (string.IsNullOrWhiteSpace(encoded))
            return verificationKeys.Count == 0 ? Disabled : new AuditIntegrity(null, null, verificationKeys);
        if (verificationKeys.ContainsKey(keyId!))
            throw new InvalidOperationException("Active audit key ID must not also be a verification key.");
        var signingKey = ParseKey(encoded);
        verificationKeys.Add(keyId!, signingKey);
        return new AuditIntegrity(keyId, signingKey, verificationKeys);
    }

    public void Sign(AuditRecord record)
    {
        if (signingKey is null) return;
        record.IntegrityKeyId = KeyId;
        record.IntegrityTag = Convert.ToHexString(HMACSHA256.HashData(signingKey, Canonical(record)));
    }

    public string Verify(AuditRecord record)
    {
        if (record.IntegrityTag is null || record.IntegrityKeyId is null ||
            !verificationKeys.TryGetValue(record.IntegrityKeyId, out var key)) return "unverified";
        byte[] supplied;
        try { supplied = Convert.FromHexString(record.IntegrityTag); }
        catch (FormatException) { return "broken"; }
        var expected = HMACSHA256.HashData(key, Canonical(record));
        return CryptographicOperations.FixedTimeEquals(expected, supplied) ? "verified" : "broken";
    }

    private static bool ValidKeyId(string value) => value.Length is > 0 and <= 40 &&
        value.All(c => char.IsAsciiLetterOrDigit(c) || c is '-' or '_' or '.');

    private static byte[] ParseKey(string encoded)
    {
        byte[] key;
        try { key = Convert.FromBase64String(encoded); }
        catch (FormatException ex) { throw new InvalidOperationException("Audit key must be base64.", ex); }
        if (key.Length < 32) throw new InvalidOperationException("Audit key must contain at least 32 bytes.");
        return key;
    }

    // Version 2 binds the chain position and predecessor, so moving or relinking a record breaks its tag.
    private static byte[] Canonical(AuditRecord record) => record.ChainSequence is null
        ? JsonSerializer.SerializeToUtf8Bytes(new
        {
            version = 1, record.Id, record.OrganizationId, record.SiteId,
            record.Principal, record.Action, record.TargetType, record.TargetId,
            record.Outcome, atUtc = record.AtUtc.ToUniversalTime().ToString("O")
        })
        : JsonSerializer.SerializeToUtf8Bytes(new
        {
            version = 2, record.Id, record.OrganizationId, record.SiteId,
            record.Principal, record.Action, record.TargetType, record.TargetId,
            record.Outcome, atUtc = record.AtUtc.ToUniversalTime().ToString("O"),
            sequence = record.ChainSequence, previous = record.PreviousTag
        });
}
