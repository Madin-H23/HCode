# Fork 同步纪律：最小品牌化，上游语义零改动

HCode 是 helsome/tinycode（MIT）的 fork，`upstream` remote 永久保留、定期合流。因此品牌化只做产品面（包名、可执行名、README 归属段），内部模块名、环境变量（`TINYCODE_HOME`）与上游行为语义零改动；原创能力一律放新目录（`desktop/` 等），改写上游文件仅限修 bug。任何「顺手重命名」都会把每次上游同步变成手工合并灾难——这是 fork 价值的对价。
