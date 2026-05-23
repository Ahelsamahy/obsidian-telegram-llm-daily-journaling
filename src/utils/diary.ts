import { moment, normalizePath, type TFile } from "obsidian";
import {
	createDailyNote,
	getAllDailyNotes,
	getDailyNote,
} from "obsidian-daily-notes-interface";
import type { JournalSettings } from "../settings/types";

const DEFAULT_CUTOFF = "00:00";

export function getAdjustedDateForTimeCutoff(
	messageDate: moment.Moment,
	timeCutoff: string
): moment.Moment {
	const parts = timeCutoff.split(":").map(Number);
	const cutoffHour = parts[0] ?? 0;
	const cutoffMinute = parts[1] ?? 0;
	const messageHour = messageDate.hour();
	const messageMinute = messageDate.minute();

	const isBeforeCutoff =
		messageHour < cutoffHour ||
		(messageHour === cutoffHour && messageMinute < cutoffMinute);

	if (isBeforeCutoff) {
		return moment(messageDate).subtract(1, "day");
	}

	return moment(messageDate);
}

export async function getDiaryWithTimeCutoff(
	settings: JournalSettings,
	messageDate?: moment.Moment
): Promise<TFile> {
	const date = messageDate ?? moment();
	const adjustedDate = getAdjustedDateForTimeCutoff(
		date,
		settings.daily_note_time_cutoff || DEFAULT_CUTOFF
	);

	const dailyNotes = getAllDailyNotes();
	const dailyNote = getDailyNote(adjustedDate, dailyNotes);

	if (dailyNote) {
		return dailyNote as TFile;
	}

	return (await createDailyNote(adjustedDate)) as TFile;
}

export async function getDiaryTargetPaths(
	settings: Pick<JournalSettings, "daily_note_time_cutoff" | "media_subfolder_name"> &
		JournalSettings,
	messageDate?: moment.Moment
): Promise<{ noteFile: TFile; mediaDir: string }> {
	const noteFile = await getDiaryWithTimeCutoff(settings, messageDate);
	const noteDir =
		noteFile.parent?.path && noteFile.parent.path !== "/"
			? noteFile.parent.path
			: "";
	const mediaDir = normalizePath(
		noteDir === ""
			? settings.media_subfolder_name
			: `${noteDir}/${settings.media_subfolder_name}`
	);
	return { noteFile, mediaDir };
}
