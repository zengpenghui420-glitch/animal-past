# 限次验证码说明 · 上辈子是什么动物

- 格式：`AP` + 4 位，例如 `AP7K3N`（共 6 位）
- 字符表：`ABCDEFGHJKMNPQRSTUVWXYZ23456789`（不含 I、L、O、0、1）
- 每个验证码最多使用 **3 次**（跨设备共享计数，存在 MantleDB）
- 命名空间：`catquiz-zph420-codes`，集合：**`ap/`**
- **只适用于本测验**。猫咪、MBTI、八字、历史、SCL 等其他测验的码不能在这里用，这里的 `AP` 码也不能拿到别的测验里用
- 「重新测试」会清掉本次解锁，再次核销验证码（**−1**）
- 「查看上次结果」只读本机 `localStorage`，**不扣次**
- 同一标签页里，已经解锁之后再点「开始测试」不会重复扣次；要重测并扣次，走「重新测试」
- 发码：付款后把 6 位码发给买家即可

共享 namespace 的免费档大约 **100 条**。猫咪 / MBTI / 八字 / 历史 / SCL 已经把名额占满时，造码会返回 `Entry limit reached`，脚本会直接失败，不会把失败的码算进成功列表。腾出条目或升级 Mantle 之后再造。

继续造码（在已配置 `MANTLE_KEY` 的机器上）：

```bash
MANTLE_KEY=*** ./tools/mint.sh 10
```

后端：MantleDB（namespace `catquiz-zph420-codes`，collection `ap`）。浏览器直接核销，与猫咪测验同一套接口，路径换成 `ap/{验证码}`。
