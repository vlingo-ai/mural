# vLingo Speaking Live：iOS 开发入口

遵循[项目开发基准](../../docs/web-ios-model-gateway-plan.md)与
[三端统一协议方案](../../docs/reviews/2026-09-23-cross-client-multi-provider-design.md)。

当前代码仍为 SwiftUI、原生 WebRTC/SDP 与本地学习 archive；不是已完成 LiveKit 迁移的版本。
Phase 6 使用 LiveKit Swift SDK、统一会话协调规则及 JSON fixtures；音频会话、来电、
后台、权限和设备切换由 iOS 适配器负责。不得直接照搬 Web 的检测事件/超时。

先修复公开契约、服务端控制确认和资源清理，再接入新客户端。Web 测试及 Simulator
不能替代 iPhone 真机的麦克风、来电、蓝牙、后台和 Wi-Fi/蜂窝切换测试。

新 App 须确定自己的 Bundle ID、开发者团队和 Google iOS OAuth，服务端变量为
`GOOGLE_IOS_CLIENT_ID`。现有 Xcode 配置键 `MURAL_GOOGLE_CLIENT_ID` 不在本次文档更新中改名。
不要复用 upstream 公共 Client ID 或把 `mural.chat` 当成本项目域名。
保留现有安装/历史数据，变更身份或云端历史迁移须显式设计和测试。

当前只推进英语；普通话/粤语暂停开放，不删除已存在的语言模块和历史解码。
原生原有功能是否可见以代码为准，不能把 Web 的 coming later 改动当成三端已同步发布。

- [现有原生安装指南](../../docs/run-on-iphone.md)
- [构建与测试](../../docs/build-and-test.md)
- [自有账户配置](../../docs/managed-accounts.md)
- [历史发布资料（非本 fork 发布批准）](../../release/README.md)
