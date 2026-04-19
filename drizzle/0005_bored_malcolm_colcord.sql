CREATE TABLE `app_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`settingKey` varchar(64) NOT NULL,
	`settingValue` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `app_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `app_settings_settingKey_unique` UNIQUE(`settingKey`)
);
--> statement-breakpoint
CREATE TABLE `skip_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`raceDate` date NOT NULL,
	`stadiumId` varchar(2) NOT NULL,
	`raceNumber` tinyint NOT NULL,
	`skipReason` text,
	`actualResult` varchar(10),
	`actualPayout` int,
	`predictedCombos` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `skip_history_id` PRIMARY KEY(`id`)
);
