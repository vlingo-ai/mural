import chat.mural.contracts.*
import kotlinx.serialization.*
import kotlinx.serialization.json.*
import java.io.File

private inline fun <reified T> roundTrip(value: JsonElement): JsonElement =
    Json.encodeToJsonElement(Json.decodeFromJsonElement<T>(value))

fun main(args: Array<String>) {
    val rows = Json.parseToJsonElement(File(args[0]).readText()).jsonArray
    for (row in rows) {
        val entry = row.jsonObject
        val value = entry.getValue("value")
        val valid = entry.getValue("valid").jsonPrimitive.boolean
        try {
            val encoded = when (entry.getValue("schema").jsonPrimitive.content) {
                "LiveTransport" -> roundTrip<LiveTransportDTO>(value)
                "LiveSession" -> roundTrip<LiveSessionDTO>(value)
                "LiveSessionStatus" -> roundTrip<LiveSessionStatusDTO>(value)
                "CurrentLiveSession" -> roundTrip<CurrentLiveSessionDTO>(value)
                "LiveSessionCreateRequest" -> roundTrip<LiveSessionCreateRequestDTO>(value)
                "HostedHelperStreamEvent" -> roundTrip<HostedHelperStreamEventDTO>(value)
                "LiveCapabilities" -> roundTrip<LiveCapabilitiesDTO>(value)
                "HostedHelperUsage" -> roundTrip<HostedHelperUsageDTO>(value)
                "HostedHelperResult" -> roundTrip<HostedHelperResultDTO>(value)
                "ErrorResponse" -> roundTrip<ErrorResponseDTO>(value)
                "LiveHistoryMessage" -> roundTrip<LiveHistoryMessageDTO>(value)
                else -> error("Unknown fixture")
            }
            check(valid) { "Invalid fixture accepted" }
            check(encoded == value) { "Wire shape changed (missing/null)" }
        } catch (error: SerializationException) { check(!valid) { "Valid fixture rejected: $error" } }
    }
    println("Kotlin shared wire fixtures: ${rows.size} PASS")
}
