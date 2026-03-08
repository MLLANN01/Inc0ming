import * as vscode from 'vscode';
import { DataStore } from '../services/dataStore';
import { daysUntil } from './dateUtils';

export class NotificationManager {
    private notifiedItems = new Set<string>();

    checkItems(store: DataStore): void {
        const config = vscode.workspace.getConfiguration('incoming.notifications');
        if (!config.get<boolean>('enabled', true)) { return; }

        const warningDays = config.get<number>('warningDays', 7);
        const urgentDays = config.get<number>('urgentDays', 1);

        for (const item of store.allRadarItems()) {
            const days = daysUntil(item.date);
            if (days < 0 || this.notifiedItems.has(item.id)) { continue; }

            if (days <= urgentDays) {
                this.notifiedItems.add(item.id);
                vscode.window.showWarningMessage(
                    `Incoming URGENT: "${item.label}" is ${days === 0 ? 'today' : `in ${days} day(s)`}!`
                );
            } else if (days <= warningDays) {
                this.notifiedItems.add(item.id);
                vscode.window.showInformationMessage(
                    `Incoming: "${item.label}" is in ${days} day(s).`
                );
            }
        }
    }

    getUpcomingCount(store: DataStore): number {
        const config = vscode.workspace.getConfiguration('incoming.notifications');
        const warningDays = config.get<number>('warningDays', 7);

        let count = 0;
        for (const item of store.allRadarItems()) {
            const days = daysUntil(item.date);
            if (days >= 0 && days <= warningDays) { count++; }
        }
        return count;
    }
}
