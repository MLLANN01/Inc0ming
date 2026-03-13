import { RadarData, RadarItem, TodoData, QuoteData, GoalData, BookmarkData, ContactData, NoteData, UnparsedLine } from '../models/types';
import { formatDateMDYY } from '../utils/dateUtils';

export function serializeIncoming(
    radar: RadarData,
    todo: TodoData,
    unparsedLines: UnparsedLine[] = [],
    quotes: QuoteData = { items: [] },
    goals: GoalData = { sections: [] },
    bookmarks: BookmarkData = { sections: [] },
    contacts: ContactData = { groups: [] },
    notes: NoteData = { notebooks: [] },
): string {
    const parts: string[] = [];

    // === Radar Section ===
    parts.push('# Radar');
    parts.push('');

    function serializeRadarItem(item: RadarItem): void {
        if (item.date) {
            // One-time
            parts.push(`- ${formatDateMDYY(item.date)} - ${item.label}`);
        } else if (item.recurrence) {
            if (item.recurrence.type === 'weekly') {
                parts.push(`- ${item.label} (${item.recurrence.days.join(', ')})`);
            } else {
                parts.push(`- ${item.label} (${item.recurrence.month}/${item.recurrence.day})`);
            }
        }
        // Sub-items
        for (const sub of item.subItems) {
            parts.push(`    - ${sub.text}`);
        }
    }

    for (const swimlane of radar.swimlanes) {
        parts.push(`## ${swimlane.name}`);

        if (swimlane.color) {
            parts.push(`<!-- color: ${swimlane.color} -->`);
        }

        for (const item of swimlane.items) {
            serializeRadarItem(item);
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
                serializeRadarItem(item);
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

    // === Goals Section ===
    if (goals.sections.length > 0) {
        parts.push('# Goals');
        parts.push('');
        for (const section of goals.sections) {
            parts.push(`## ${section.name}`);
            for (const goal of section.items) {
                const checkbox = goal.completed ? '[x]' : '[ ]';
                let line = `- ${checkbox} ${goal.text}`;
                if (goal.radarLink) { line += ` {radar:${goal.radarLink}}`; }
                parts.push(line);
                if (goal.completionNote) { parts.push(`    Completed ${goal.completionNote}`); }
                if (goal.dueDate) { parts.push(`    Due: ${goal.dueDate}`); }
                for (const ms of goal.milestones) {
                    const msCheck = ms.completed ? '[x]' : '[ ]';
                    parts.push(`    - ${msCheck} ${ms.text} (${ms.weight}%)`);
                    if (ms.completionNote) { parts.push(`        Completed ${ms.completionNote}`); }
                    if (ms.dueDate) { parts.push(`        Due: ${ms.dueDate}`); }
                }
            }
            parts.push('');
        }
    }

    // === Bookmarks Section ===
    if (bookmarks.sections.length > 0) {
        parts.push('# Bookmarks');
        parts.push('');
        for (const section of bookmarks.sections) {
            parts.push(`## ${section.name}`);
            for (const item of section.items) {
                parts.push(`- [${item.title}](${item.url})`);
            }
            parts.push('');
        }
    }

    // === Contacts Section ===
    if (contacts.groups.length > 0) {
        parts.push('# Contacts');
        parts.push('');
        for (const group of contacts.groups) {
            parts.push(`## ${group.name}`);
            for (const contact of group.items) {
                if (contact.contactType) {
                    parts.push(`- ${contact.name} (${contact.contactType})`);
                } else {
                    parts.push(`- ${contact.name}`);
                }
                if (contact.email) { parts.push(`    Email: ${contact.email}`); }
                if (contact.phone) { parts.push(`    Phone: ${contact.phone}`); }
                if (contact.notes) { parts.push(`    Notes: ${contact.notes}`); }
            }
            parts.push('');
        }
    }

    // === Notes Section ===
    if (notes.notebooks.length > 0) {
        parts.push('# Notes');
        parts.push('');
        for (const notebook of notes.notebooks) {
            parts.push(`## ${notebook.name}`);
            for (const page of notebook.pages) {
                parts.push(`- ${page.title}`);
                if (page.createdAt) { parts.push(`    Created: ${page.createdAt}`); }
                if (page.updatedAt) { parts.push(`    Updated: ${page.updatedAt}`); }
                if (page.tags.length > 0) {
                    const tagStr = page.tags.map(t => `{${t.type}:${t.target}}`).join(' ');
                    parts.push(`    Tags: ${tagStr}`);
                }
            }
            parts.push('');
        }
    }

    // === Todo Section ===
    parts.push('# TODO');

    for (const section of todo.sections) {
        parts.push(`## ${section.name}`);

        for (const item of section.items) {
            const checkbox = item.completed ? '[x]' : '[ ]';
            let line = `* ${checkbox} ${item.text}`;
            if (item.radarLink) {
                line += ` {radar:${item.radarLink}}`;
            }
            parts.push(line);

            if (item.dueDate) {
                parts.push(`    Due: ${item.dueDate}`);
            }

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
