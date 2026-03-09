import { RadarData, TodoData, QuoteData, ReminderData, UnparsedLine } from '../models/types';
import { formatDateMDYY } from '../utils/dateUtils';

export function serializeIncoming(
    radar: RadarData,
    todo: TodoData,
    unparsedLines: UnparsedLine[] = [],
    quotes: QuoteData = { items: [] },
    reminders: ReminderData = { meetings: [] },
): string {
    const parts: string[] = [];

    // === Radar Section ===
    parts.push('# Radar');
    parts.push('');

    for (const swimlane of radar.swimlanes) {
        parts.push(`## ${swimlane.name}`);

        if (swimlane.color) {
            parts.push(`<!-- color: ${swimlane.color} -->`);
        }

        for (const item of swimlane.items) {
            parts.push(`- ${formatDateMDYY(item.date)} - ${item.label}`);
        }

        // Unparsed lines that belonged to this swimlane (direct)
        for (const ul of unparsedLines) {
            if (ul.afterSection === swimlane.name) {
                parts.push(ul.content);
            }
        }

        for (const subGroup of swimlane.subGroups) {
            parts.push(`### ${subGroup.name}`);
            for (const item of subGroup.items) {
                parts.push(`- ${formatDateMDYY(item.date)} - ${item.label}`);
            }

            // Unparsed lines for this sub-group
            const sgKey = swimlane.name + '/' + subGroup.name;
            for (const ul of unparsedLines) {
                if (ul.afterSection === sgKey) {
                    parts.push(ul.content);
                }
            }
        }

        parts.push('');
    }

    // === Quotes Section ===
    if (quotes.items.length > 0) {
        parts.push('# Quotes');
        for (const q of quotes.items) {
            if (q.attribution) {
                parts.push(`> ${q.text} — ${q.attribution}`);
            } else {
                parts.push(`> ${q.text}`);
            }
        }
        parts.push('');
    }

    // === Reminders Section ===
    if (reminders.meetings.length > 0) {
        parts.push('# Reminders');
        for (const meeting of reminders.meetings) {
            if (meeting.days.length > 0) {
                parts.push(`## ${meeting.name} (${meeting.days.join(', ')})`);
            } else {
                parts.push(`## ${meeting.name}`);
            }
            for (const point of meeting.points) {
                parts.push(`- ${point.text}`);
            }
        }
        parts.push('');
    }

    // === Todo Section ===
    parts.push('# TODO');

    for (const section of todo.sections) {
        if (section.name) {
            parts.push(`## ${section.name}`);
        }

        for (const item of section.items) {
            const checkbox = item.completed ? '[x]' : '[ ]';
            let line = `* ${checkbox} ${item.text}`;
            if (item.radarLink) {
                line += ` {radar:${item.radarLink}}`;
            }
            parts.push(line);

            if (item.notes) {
                for (const line of item.notes.split('\n')) {
                    if (line.trim()) {
                        parts.push(`    ${line}`);
                    }
                }
            }
        }
    }

    return parts.join('\n') + '\n';
}
