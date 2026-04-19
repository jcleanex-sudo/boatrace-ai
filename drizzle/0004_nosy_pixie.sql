CREATE TABLE `bankroll` (
	`id` int AUTO_INCREMENT NOT NULL,
	`raceDate` date NOT NULL,
	`totalBet` int NOT NULL DEFAULT 0,
	`totalPayout` int NOT NULL DEFAULT 0,
	`totalRaces` int NOT NULL DEFAULT 0,
	`hitRaces` int NOT NULL DEFAULT 0,
	`returnRate` float,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bankroll_id` PRIMARY KEY(`id`),
	CONSTRAINT `bankroll_raceDate_unique` UNIQUE(`raceDate`)
);
--> statement-breakpoint
ALTER TABLE `prediction_logs` ADD `betAmount` int;