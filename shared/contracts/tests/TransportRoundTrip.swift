import Foundation

@main enum TransportRoundTrip {
    static func main() throws {
        let decoder = JSONDecoder(), encoder = JSONEncoder()
        for source in [#"{"type":"webrtc","sdp":"v=0"}"#,
                       #"{"type":"livekit-room","url":"wss://example.invalid","token":"synthetic"}"#] {
            let data = Data(source.utf8)
            let value = try decoder.decode(LiveTransportDTO.self, from: data)
            let encoded = try encoder.encode(value)
            let original = try JSONSerialization.jsonObject(with: data) as! NSDictionary
            let restored = try JSONSerialization.jsonObject(with: encoded) as! NSDictionary
            precondition(original == restored)
        }
        for source in [#"{"type":"other"}"#, #"{"type":"livekit-room","url":"wss://example.invalid"}"#,
                       #"{"type":"webrtc"}"#, #"{"type":null}"#, #"{}"#] {
            do {
                _ = try decoder.decode(LiveTransportDTO.self, from: Data(source.utf8))
                fatalError("Invalid transport accepted")
            } catch is DecodingError { }
        }
        do {
            _ = try encoder.encode(LiveTransportDTO.webrtc(.init(type: "wrong", sdp: "v=0")))
            fatalError("Mismatched transport encoded")
        } catch is EncodingError { }
        print("Swift transport round-trip and rejection: PASS")
    }
}
