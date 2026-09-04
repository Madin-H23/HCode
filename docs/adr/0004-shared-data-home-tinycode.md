# 数据目录同源：桌面端与 CLI 共用 ~/.tinycode

桌面端不设独立数据目录，沿用上游 `TINYCODE_HOME` 解析（默认 `~/.tinycode`）：三张面读写同一会话家族，终端里 `hcode -c` 可以接上桌面端聊到一半的会话，反之亦然。独立 `%APPDATA%/HCode` 被拒绝——「一个 Harness 三张面」若数据分家，面就不是同一张脸。SQLite 索引同样放 `<dataHome>/sessions/` 下，作为可随时重建的衍生层（见 ADR-0002）。
