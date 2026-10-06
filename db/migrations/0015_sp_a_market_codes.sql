-- SP-A §3.6 旧数据迁移（只改数据不改结构）：
-- 1) 市场：旧显示文案 'English · Global' → 'global-en'；其余不在市场表 code 内的值（中文/东南亚/空等）清空，下次运行前需重选。
-- 2) 品类：8 个旧下拉值（zh/en 各 4 个）全部清空——它们是站型/默认值，不是真实品类描述，需用户重新填写。
-- 3) 语言：只做英文市场，统一 en。
UPDATE `projects` SET `market` = 'global-en' WHERE `market` IN ('English · Global');--> statement-breakpoint
UPDATE `projects` SET `market` = '' WHERE `market` NOT IN ('global-en','us','gb','ca','au','ie','nz','sg','in','za');--> statement-breakpoint
UPDATE `projects` SET `industry` = '' WHERE `industry` IN ('B2B SaaS · 项目协作','跨境电商','本地服务','其他…','B2B SaaS · Team collaboration','Cross-border e-commerce','Local services','Other…');--> statement-breakpoint
UPDATE `projects` SET `language` = 'en';
