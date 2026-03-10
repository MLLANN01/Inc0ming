import * as vscode from 'vscode';
import { DataStore } from '../services/dataStore';
import { RadarSwimlane, RadarSubGroup, RadarItem } from '../models/types';
import { daysUntil, formatDateMDYY, getUrgencyLevel } from '../utils/dateUtils';
import { isVirtualGoal, isVirtualMilestone, isVirtualTodo } from '../utils/virtualItems';

export type RadarTreeItem =
    | { kind: 'swimlane'; swimlane: RadarSwimlane }
    | { kind: 'subgroup'; subGroup: RadarSubGroup; swimlaneId: string }
    | { kind: 'radarItem'; item: RadarItem };

export class RadarTreeProvider implements vscode.TreeDataProvider<RadarTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<RadarTreeItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private store: DataStore) {
        store.onDidChange(() => this._onDidChangeTreeData.fire());
    }

    getTreeItem(element: RadarTreeItem): vscode.TreeItem {
        switch (element.kind) {
            case 'swimlane': {
                const sw = element.swimlane;
                const itemCount = sw.items.length + sw.subGroups.reduce((n, sg) => n + sg.items.length, 0);
                const item = new vscode.TreeItem(sw.name, vscode.TreeItemCollapsibleState.Expanded);
                item.id = sw.id;
                item.description = `${itemCount} item${itemCount !== 1 ? 's' : ''}`;
                item.iconPath = new vscode.ThemeIcon('layers');
                item.contextValue = 'swimlane';
                return item;
            }
            case 'subgroup': {
                const sg = element.subGroup;
                const item = new vscode.TreeItem(sg.name, vscode.TreeItemCollapsibleState.Expanded);
                item.id = sg.id;
                item.iconPath = new vscode.ThemeIcon('folder');
                item.contextValue = 'subgroup';
                return item;
            }
            case 'radarItem': {
                const ri = element.item;
                const days = daysUntil(ri.date);
                const dateStr = formatDateMDYY(ri.date);
                const label = `${dateStr} — ${ri.label}`;

                let description: string;
                if (days < 0) { description = `${Math.abs(days)}d ago`; }
                else if (days === 0) { description = 'today'; }
                else { description = `${days}d`; }

                const urgency = getUrgencyLevel(days);
                let iconColor: vscode.ThemeColor;
                switch (urgency) {
                    case 'urgent': iconColor = new vscode.ThemeColor('errorForeground'); break;
                    case 'warning': iconColor = new vscode.ThemeColor('editorWarning.foreground'); break;
                    case 'past': iconColor = new vscode.ThemeColor('disabledForeground'); break;
                    default: iconColor = new vscode.ThemeColor('textLink.foreground'); break;
                }

                let iconName = 'circle-filled';
                if (isVirtualGoal(ri.id)) { iconName = 'diamond'; }
                else if (isVirtualMilestone(ri.id)) { iconName = 'milestone'; }
                else if (isVirtualTodo(ri.id)) { iconName = 'star-empty'; }

                const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
                item.id = ri.id;
                item.description = description;
                item.iconPath = new vscode.ThemeIcon(iconName, iconColor);
                item.contextValue = 'radarItem';
                return item;
            }
        }
    }

    getParent(element: RadarTreeItem): RadarTreeItem | undefined {
        switch (element.kind) {
            case 'swimlane':
                return undefined;
            case 'subgroup': {
                const augmented = this.store.computeAugmentedRadar();
                const sw = augmented.swimlanes.find(s => s.id === element.swimlaneId);
                return sw ? { kind: 'swimlane', swimlane: sw } : undefined;
            }
            case 'radarItem': {
                const augmented = this.store.computeAugmentedRadar();
                for (const sw of augmented.swimlanes) {
                    if (sw.items.some(i => i.id === element.item.id)) {
                        return { kind: 'swimlane', swimlane: sw };
                    }
                    for (const sg of sw.subGroups) {
                        if (sg.items.some(i => i.id === element.item.id)) {
                            return { kind: 'subgroup', subGroup: sg, swimlaneId: sw.id };
                        }
                    }
                }
                return undefined;
            }
        }
    }

    getRootElements(): RadarTreeItem[] {
        const augmented = this.store.computeAugmentedRadar();
        return augmented.swimlanes.map(sw => ({ kind: 'swimlane' as const, swimlane: sw }));
    }

    getChildren(element?: RadarTreeItem): RadarTreeItem[] {
        if (!element) {
            return this.getRootElements();
        }

        switch (element.kind) {
            case 'swimlane': {
                const sw = element.swimlane;
                const children: RadarTreeItem[] = [];

                // Direct items sorted by date
                const sortedItems = sw.items.slice().sort((a, b) => a.date.getTime() - b.date.getTime());
                for (const item of sortedItems) {
                    children.push({ kind: 'radarItem', item });
                }

                // Sub-groups
                for (const sg of sw.subGroups) {
                    children.push({ kind: 'subgroup', subGroup: sg, swimlaneId: sw.id });
                }

                return children;
            }
            case 'subgroup': {
                const sg = element.subGroup;
                const sortedItems = sg.items.slice().sort((a, b) => a.date.getTime() - b.date.getTime());
                return sortedItems.map(item => ({ kind: 'radarItem' as const, item }));
            }
            case 'radarItem':
                return [];
        }
    }
}
