using System.Text.Json;
using System.Text.Json.Serialization;

namespace Waylorn.ControlPlane.Application;

public static class EventJson
{
    public static JsonSerializerOptions Options { get; } = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter() }
    };
}
