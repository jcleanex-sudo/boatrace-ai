CREATE TABLE `odds_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`raceDate` date NOT NULL,
	`stadiumId` varchar(2) NOT NULL,
	`raceNumber` tinyint NOT NULL,
	`combo` varchar(10) NOT NULL,
	`odds` decimal(8,1) NOT NULL,
	`recordedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `odds_history_id` PRIMARY KEY(`id`)
);
