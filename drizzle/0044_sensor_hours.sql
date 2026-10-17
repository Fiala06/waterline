CREATE TABLE `sensor_hours` (
	`tank_id` text NOT NULL,
	`parameter_id` text NOT NULL,
	`hour` text NOT NULL,
	`n` integer NOT NULL,
	`total` real NOT NULL,
	`lo` real NOT NULL,
	`hi` real NOT NULL,
	PRIMARY KEY(`tank_id`, `parameter_id`, `hour`)
);
--> statement-breakpoint
-- Hours of samples (#103), from what's there now
INSERT INTO `sensor_hours` (`tank_id`, `parameter_id`, `hour`, `n`, `total`, `lo`, `hi`)
SELECT `tank_id`, `parameter_id`, substr(`at`, 1, 13), count(*), sum(`value`), min(`value`), max(`value`)
FROM `sensor_readings` GROUP BY `tank_id`, `parameter_id`, substr(`at`, 1, 13);
--> statement-breakpoint
-- and from now on, every sample counts in its hour
CREATE TRIGGER `sensor_hours_add` AFTER INSERT ON `sensor_readings` BEGIN
	INSERT INTO `sensor_hours` (`tank_id`, `parameter_id`, `hour`, `n`, `total`, `lo`, `hi`)
	VALUES (new.`tank_id`, new.`parameter_id`, substr(new.`at`, 1, 13), 1, new.`value`, new.`value`, new.`value`)
	ON CONFLICT (`tank_id`, `parameter_id`, `hour`) DO UPDATE SET
		`n` = `n` + 1, `total` = `total` + excluded.`total`, `lo` = min(`lo`, excluded.`lo`), `hi` = max(`hi`, excluded.`hi`);
END;
--> statement-breakpoint
-- a sample gone (pruned after a year, or its tank or parameter deleted) leaves its hour; the
-- hour's lowest and highest stay as they were until the hour's last sample goes
CREATE TRIGGER `sensor_hours_remove` AFTER DELETE ON `sensor_readings` BEGIN
	UPDATE `sensor_hours` SET `n` = `n` - 1, `total` = `total` - old.`value`
	WHERE `tank_id` = old.`tank_id` AND `parameter_id` = old.`parameter_id` AND `hour` = substr(old.`at`, 1, 13);
	DELETE FROM `sensor_hours`
	WHERE `tank_id` = old.`tank_id` AND `parameter_id` = old.`parameter_id` AND `hour` = substr(old.`at`, 1, 13) AND `n` <= 0;
END;
