# 微信远程 IM 手工 Smoke Checklist

## 前置条件

- 已有可扫码的微信账号。
- Agent Works sidecar 已启动。
- Settings > Remote Connections 能看到 WeChat experimental adapter。
- 本 smoke 不作为 CI 阻断条件。

## 检查项

- [ ] 扫码登录返回 confirmed，生成 connection。
- [ ] 手动 enable connection 后状态变为 running。
- [ ] 微信发送纯文本问题，sidecar 日志出现 getupdates 入站消息，并且微信收到 AI 生成的文本回复。
- [ ] 微信发送文件或图片，sidecar 下载到数据目录，日志显示 attachment path。
- [ ] fake channel 自动化 E2E 已通过。
- [ ] 微信发送文件和说明后，如果 run 成功，微信收到摘要。
- [ ] 如果 output 文件回发失败，remote_tasks.reply_state 变为 failed 或 manual_check，并记录 error_msg。
- [ ] disable connection 后轮询停止。

## 失败记录

记录失败时间、日志片段、connection id、remote task id、是否可复现。
