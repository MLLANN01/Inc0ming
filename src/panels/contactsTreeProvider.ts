import * as vscode from 'vscode';
import { DataStore } from '../services/dataStore';
import { ContactGroup, ContactItem } from '../models/types';

export type ContactsTreeItem =
    | { kind: 'contactGroup'; group: ContactGroup }
    | { kind: 'contact'; contact: ContactItem; groupId: string }
    | { kind: 'contactDetail'; label: string; value: string; contactId: string; field: 'email' | 'phone' | 'notes' };

export class ContactsTreeProvider implements vscode.TreeDataProvider<ContactsTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<ContactsTreeItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private store: DataStore) {
        store.onDidChange(() => this._onDidChangeTreeData.fire());
    }

    getTreeItem(element: ContactsTreeItem): vscode.TreeItem {
        switch (element.kind) {
            case 'contactGroup': {
                const g = element.group;
                const count = g.items.length;
                const item = new vscode.TreeItem(g.name, vscode.TreeItemCollapsibleState.Expanded);
                item.id = g.id;
                item.description = `${count} contact${count !== 1 ? 's' : ''}`;
                item.iconPath = new vscode.ThemeIcon('organization');
                item.contextValue = 'contactGroup';
                return item;
            }
            case 'contact': {
                const c = element.contact;
                const item = new vscode.TreeItem(c.name, vscode.TreeItemCollapsibleState.Collapsed);
                item.id = c.id;
                item.description = c.contactType || undefined;
                item.iconPath = new vscode.ThemeIcon('person');
                item.contextValue = 'contact';
                return item;
            }
            case 'contactDetail': {
                let iconName: string;
                switch (element.field) {
                    case 'email': iconName = 'mail'; break;
                    case 'phone': iconName = 'device-mobile'; break;
                    case 'notes': iconName = 'note'; break;
                }
                const item = new vscode.TreeItem(
                    `${element.label}: ${element.value}`,
                    vscode.TreeItemCollapsibleState.None,
                );
                item.iconPath = new vscode.ThemeIcon(iconName);
                item.contextValue = 'contactDetail';
                return item;
            }
        }
    }

    getParent(element: ContactsTreeItem): ContactsTreeItem | undefined {
        switch (element.kind) {
            case 'contactGroup':
                return undefined;
            case 'contact': {
                const group = this.store.findContactGroup(element.groupId);
                return group ? { kind: 'contactGroup', group } : undefined;
            }
            case 'contactDetail': {
                const result = this.store.findContact(element.contactId);
                if (!result) { return undefined; }
                return { kind: 'contact', contact: result.contact, groupId: result.group.id };
            }
        }
    }

    getChildren(element?: ContactsTreeItem): ContactsTreeItem[] {
        if (!element) {
            return this.store.contacts.groups.map(g => ({ kind: 'contactGroup' as const, group: g }));
        }

        switch (element.kind) {
            case 'contactGroup': {
                return element.group.items.map(c => ({
                    kind: 'contact' as const,
                    contact: c,
                    groupId: element.group.id,
                }));
            }
            case 'contact': {
                const c = element.contact;
                const details: ContactsTreeItem[] = [];
                if (c.email) {
                    details.push({ kind: 'contactDetail', label: 'Email', value: c.email, contactId: c.id, field: 'email' });
                }
                if (c.phone) {
                    details.push({ kind: 'contactDetail', label: 'Phone', value: c.phone, contactId: c.id, field: 'phone' });
                }
                if (c.notes) {
                    details.push({ kind: 'contactDetail', label: 'Notes', value: c.notes, contactId: c.id, field: 'notes' });
                }
                return details;
            }
            case 'contactDetail':
                return [];
        }
    }
}
