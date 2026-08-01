# 统一 reminders 模型：多个提醒点 + 周期重复提醒

需求是"课程/待办/活动都要提醒，且支持多次提醒"。早期模型只有单一 `remindMinutes`，无法表达多提醒点与周期重复。现统一为 `reminders: { points: number[], repeat: { start, every } | null }`：`points` 为"提前 N 分钟各提醒一次"，`repeat` 为"截止前 start 分钟起每 every 分钟提醒一次"。旧字段 `remindMinutes` 自动迁移为 `points:[n]`。

- **Consequences**：提醒循环按 30 秒轮询，按"截止时间/上课时间"计算是否落在提醒窗口；`notified` 集合按天去重，避免重复弹窗。