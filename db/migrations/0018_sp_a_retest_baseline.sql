-- 回测基线持久化（验收新发现 5）。drizzle-kit 为 SQLite 生成 ADD COLUMN 时丢掉了 ON DELETE 子句（快照里是 set null），
-- 这里手动补齐：基线 run 被删除时回测的 baseline_run_id 置空，否则单独删基线会因外键约束失败。
ALTER TABLE `runs` ADD `baseline_run_id` text REFERENCES runs(id) ON DELETE set null;
