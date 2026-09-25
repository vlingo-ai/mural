import Foundation

@main enum LiveWireRoundTrip {
    static func roundTrip<T: Codable>(_ type: T.Type, _ data: Data) throws -> Data {
        try JSONEncoder().encode(JSONDecoder().decode(type, from: data))
    }
    static func main() throws {
        let rows = try JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1]))) as! [[String: Any]]
        for row in rows {
            let data = try JSONSerialization.data(withJSONObject: row["value"]!)
            let valid = row["valid"] as! Bool
            do {
                let encoded: Data
                switch row["schema"] as! String {
                case "LiveTransport": encoded = try roundTrip(LiveTransportDTO.self, data)
                case "LiveSession": encoded = try roundTrip(LiveSessionDTO.self, data)
                case "LiveSessionStatus": encoded = try roundTrip(LiveSessionStatusDTO.self, data)
                case "CurrentLiveSession": encoded = try roundTrip(CurrentLiveSessionDTO.self, data)
                case "LiveSessionCreateRequest": encoded = try roundTrip(LiveSessionCreateRequestDTO.self, data)
                case "HostedHelperStreamEvent": encoded = try roundTrip(HostedHelperStreamEventDTO.self, data)
                case "LiveCapabilities": encoded = try roundTrip(LiveCapabilitiesDTO.self, data)
                case "HostedHelperUsage": encoded = try roundTrip(HostedHelperUsageDTO.self, data)
                case "HostedHelperResult": encoded = try roundTrip(HostedHelperResultDTO.self, data)
                case "ErrorResponse": encoded = try roundTrip(ErrorResponseDTO.self, data)
                case "LiveHistoryMessage": encoded = try roundTrip(LiveHistoryMessageDTO.self, data)
                default: fatalError("Unknown fixture")
                }
                precondition(valid, "Invalid fixture accepted")
                let before = try JSONSerialization.jsonObject(with: data) as! NSDictionary
                let after = try JSONSerialization.jsonObject(with: encoded) as! NSDictionary
                precondition(before == after, "Wire shape changed (missing/null)")
            } catch is DecodingError { precondition(!valid, "Valid fixture rejected") }
        }
        print("Swift shared wire fixtures: \(rows.count) PASS")
    }
}
